package collector

import (
	"path/filepath"
	"time"

	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/saves"
)

type saveOutcome struct {
	unchanged bool
	checkedAt time.Time
	result    *saves.Result
	err       error
	modified  time.Time
	size      int64
	path      string
}

func (c *Collector) savesEnabled() bool {
	return c.cfg.Saves.Reader != "" && (c.cfg.SaveDir != "" || c.cfg.Saves.Path != "" || c.cfg.Saves.Remote != "")
}

func (c *Collector) savePathNow() (string, bool) {
	if c.cfg.Saves.Path != "" {
		return c.cfg.Saves.Path, true
	}
	world := c.mapper.Server().Slot
	if world == "" {
		world = c.cfg.WorldName()
	}
	return saves.Locate(c.cfg.SaveDir, world)
}

func (c *Collector) checkSaves() {
	if !c.savesEnabled() || c.saveRunning {
		return
	}
	if c.remoteSave != nil {
		c.checkRemoteSave()
		return
	}
	path, ok := c.savePathNow()
	if !ok {
		if !c.saveDirWarned {
			c.saveDirWarned = true
			c.log.Warn("no world save was found; set saves.path to the world's .sav file", "looked_in", c.cfg.SaveDir)
		}
		return
	}
	c.saveDirWarned = false
	modified, size, err := saves.Modified(path)
	if err != nil {
		return
	}
	now := time.Now()
	if path != c.savePath || !modified.Equal(c.saveModified) || size != c.saveSize {
		c.savePath, c.saveModified, c.saveSize = path, modified, size
		if c.saveReadAt.IsZero() {
			c.saveChangedAt = now.Add(-c.options.SaveDebounce)
		} else {
			c.saveChangedAt = now
		}
		return
	}
	if c.saveChangedAt.IsZero() || now.Sub(c.saveChangedAt) < c.options.SaveDebounce {
		return
	}
	if !c.saveReadAt.IsZero() && now.Sub(c.saveReadAt) < c.cfg.Saves.Interval {
		return
	}
	c.saveChangedAt = time.Time{}
	c.saveRunning = true
	reader := c.cfg.Saves.Reader
	go func() {
		result, err := c.readSave(reader, path)
		select {
		case c.saveResults <- saveOutcome{result: result, err: err, modified: modified, size: size, path: path}:
		case <-c.loopCtx.Done():
		}
	}()
}

func (c *Collector) onSaveResult(outcome saveOutcome) {
	c.saveRunning = false
	c.saveReadAt = time.Now()
	if outcome.err != nil {
		c.saveState = stateError
		if message := outcome.err.Error(); message != c.saveProblem {
			c.saveProblem = message
			c.log.Warn("reading the world save failed", "file", outcome.path, "error", outcome.err)
		}
		return
	}
	if !outcome.checkedAt.IsZero() {
		c.remoteSaveChecked = outcome.checkedAt
	}
	if outcome.unchanged {
		c.saveState = stateOK
		c.saveProblem = ""
		return
	}
	if c.remoteSave != nil {
		c.saveModified = outcome.modified
		c.saveSize = outcome.size
	}
	if c.saveState != stateOK {
		c.log.Info("reading the world save", "file", outcome.path, "characters", len(outcome.result.Characters))
	}
	c.saveState = stateOK
	c.saveProblem = ""
	for _, item := range c.saveTracker.Changes(outcome.result) {
		data := item.Data
		var player *event.EventPlayer
		if saved, ok := data.(event.SavePlayerData); ok {
			if id, known := c.mapper.Identify(saved.Name); known {
				saved.UserID = event.String(id.UserID)
			}
			data = saved
		}
		c.emit(item.Type, outcome.result.SavedAt, player, data)
	}
}

func (c *Collector) checkRemoteSave() {
	if time.Since(c.remoteSaveAttempt) < c.cfg.Saves.Interval {
		return
	}
	c.remoteSaveAttempt = time.Now()
	c.saveRunning = true
	previous, size := c.saveModified, c.saveSize
	path := filepath.Join(c.journal.Dir(), "remote-world.sav")
	go func() {
		outcome := saveOutcome{path: path}
		entry, err := c.remoteSave.Stat(c.loopCtx)
		if err == nil && !previous.IsZero() && entry.Modified.Equal(previous) && entry.Size == size {
			outcome.unchanged = true
		} else if err == nil {
			entry, err = c.remoteSave.Save(c.loopCtx, path, func(file string) error {
				var readErr error
				outcome.result, readErr = c.readSave(c.cfg.Saves.Reader, file)
				return readErr
			})
			outcome.modified, outcome.size = entry.Modified, entry.Size
		}
		outcome.err = err
		if err == nil {
			outcome.checkedAt = time.Now()
		}
		select {
		case c.saveResults <- outcome:
		case <-c.loopCtx.Done():
		}
	}()
}

func (c *Collector) readSave(reader, path string) (*saves.Result, error) {
	if c.options.ReadSave != nil {
		return c.options.ReadSave(c.loopCtx, reader, path)
	}
	return saves.Read(c.loopCtx, reader, path)
}

func (c *Collector) remoteObservation() *event.RemoteObservation {
	remoteSaves := c.cfg.Saves.Remote != "" && c.savesEnabled()
	if c.cfg.Logs.Source != "remote" && !remoteSaves {
		return nil
	}
	out := &event.RemoteObservation{}
	if c.cfg.Logs.Source == "remote" {
		seconds := c.cfg.Logs.Interval.Seconds()
		out.LogsPollS = &seconds
	}
	if remoteSaves {
		seconds := c.cfg.Saves.Interval.Seconds()
		out.SavesPollS = &seconds
	}
	if !c.remoteLogChecked.IsZero() {
		at := c.remoteLogChecked
		out.LogsCheckedAt = &at
	}
	if !c.remoteSaveChecked.IsZero() {
		at := c.remoteSaveChecked
		out.SavesCheckedAt = &at
	}
	return out
}
