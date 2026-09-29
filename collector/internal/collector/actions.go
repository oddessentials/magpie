package collector

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/ingest"
)

const actionLogFileName = "actions.jsonl"

const (
	actionStarted  = "started"
	actionFinished = "finished"
)

type actionEntry struct {
	ID    int64  `json:"id"`
	Kind  string `json:"kind"`
	State string `json:"state"`
	At    string `json:"at"`
}

type ActionLog struct {
	mu      sync.Mutex
	path    string
	entries map[int64]actionEntry
	lines   int
}

func OpenActionLog(dir string) (*ActionLog, error) {
	log := &ActionLog{path: filepath.Join(dir, actionLogFileName), entries: map[int64]actionEntry{}}
	data, err := os.ReadFile(log.path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		var entry actionEntry
		if json.Unmarshal(scanner.Bytes(), &entry) != nil || entry.ID == 0 {
			continue
		}
		log.lines++
		log.entries[entry.ID] = entry
	}
	return log, nil
}

func (l *ActionLog) Known(id int64) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	_, ok := l.entries[id]
	return ok
}

func (l *ActionLog) Interrupted() []actionEntry {
	l.mu.Lock()
	defer l.mu.Unlock()
	var out []actionEntry
	for _, entry := range l.entries {
		if entry.State == actionStarted {
			out = append(out, entry)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (l *ActionLog) Record(id int64, kind, state string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	entry := actionEntry{ID: id, Kind: kind, State: state, At: time.Now().UTC().Format(time.RFC3339)}
	l.entries[id] = entry
	if l.lines > 2000 {
		return l.compact()
	}
	line, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(l.path, os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	if _, err := file.Write(append(line, '\n')); err != nil {
		return err
	}
	l.lines++
	return file.Sync()
}

func (l *ActionLog) compact() error {
	ids := make([]int64, 0, len(l.entries))
	for id := range l.entries {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	if len(ids) > 1000 {
		for _, id := range ids[:len(ids)-1000] {
			delete(l.entries, id)
		}
		ids = ids[len(ids)-1000:]
	}
	var buffer bytes.Buffer
	for _, id := range ids {
		line, err := json.Marshal(l.entries[id])
		if err != nil {
			continue
		}
		buffer.Write(line)
		buffer.WriteByte('\n')
	}
	temp := l.path + ".tmp"
	if err := os.WriteFile(temp, buffer.Bytes(), 0o644); err != nil {
		return err
	}
	if err := os.Rename(temp, l.path); err != nil {
		return err
	}
	l.lines = len(ids)
	return nil
}

type actionResult struct {
	Action ingest.Action
	Err    error
}

func executeAction(action ingest.Action) error {
	return fmt.Errorf("this collector runs no site actions; %q was not carried out", action.Kind)
}

func runActions(ctx context.Context, log *ActionLog, incoming <-chan []ingest.Action, results chan<- actionResult) {
	for {
		var batch []ingest.Action
		select {
		case <-ctx.Done():
			return
		case batch = <-incoming:
		}
		sort.SliceStable(batch, func(i, j int) bool { return batch[i].ID < batch[j].ID })
		for _, action := range batch {
			if ctx.Err() != nil {
				return
			}
			if action.ID <= 0 || log.Known(action.ID) {
				continue
			}
			if err := log.Record(action.ID, action.Kind, actionStarted); err != nil {
				results <- actionResult{Action: action, Err: fmt.Errorf("recording the action before running it failed: %w", err)}
				continue
			}
			err := executeAction(action)
			log.Record(action.ID, action.Kind, actionFinished)
			select {
			case results <- actionResult{Action: action, Err: err}:
			case <-ctx.Done():
				return
			}
		}
	}
}

func (c *Collector) onActionResult(result actionResult) {
	c.ensureStarted()
	if result.Err != nil {
		c.log.Warn("action failed", "id", result.Action.ID, "kind", result.Action.Kind, "error", result.Err)
	} else {
		c.log.Info("action completed", "id", result.Action.ID, "kind", result.Action.Kind)
	}
	item := actionEmission(result, time.Now())
	c.emit(item.Type, item.At, nil, item.Data)
	c.pipe.Wake()
}

func actionEmission(result actionResult, at time.Time) emission {
	if result.Err != nil {
		return emission{Type: event.TypeActionFailed, At: at, Data: event.ActionFailedData{
			ActionID: result.Action.ID,
			Kind:     result.Action.Kind,
			Error:    result.Err.Error(),
		}}
	}
	return emission{Type: event.TypeActionCompleted, At: at, Data: event.ActionCompletedData{
		ActionID: result.Action.ID,
		Kind:     result.Action.Kind,
	}}
}
