package collector

import (
	"fmt"
	"time"

	"github.com/oddessentials/magpie/collector/internal/config"
	"github.com/oddessentials/magpie/collector/internal/dragonwilds"
	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/serverlog"
)

func (c *Collector) onLine(line serverlog.Line) {
	c.lastLogLine = time.Now()
	record, ok := serverlog.Parse(line.Text)
	if !ok {
		return
	}
	at := c.recordTime(record, line)
	for _, item := range c.mapper.Map(record, at) {
		if item.Type == dragonwilds.TypeWorldLoaded {
			if loaded, ok := item.Data.(dragonwilds.WorldLoaded); ok {
				c.markOnline(loaded, item.At)
			}
			continue
		}
		c.emit(item.Type, item.At, item.Player, item.Data)
	}
}

func (c *Collector) recordTime(record serverlog.Record, line serverlog.Line) time.Time {
	reference := line.SourceTime
	live := !reference.IsZero()
	if reference.IsZero() {
		reference = line.ReceivedAt
		live = c.launched
	}
	parsed, ok := serverlog.ParseTimestamp(record.Timestamp)
	if !ok {
		return reference
	}
	if live {
		drift := parsed.Sub(reference)
		if drift > 2*time.Minute || drift < -2*time.Minute {
			if !c.clockWarned {
				c.clockWarned = true
				c.log.Warn("log timestamps differ from the clock", "difference", drift.Round(time.Minute).String())
			}
			return reference
		}
	}
	return parsed
}

func (c *Collector) onSourceState(state sourceState) bool {
	previous := c.logState
	c.logState = state.state
	switch state.state {
	case serverlog.StateConnected:
		if previous != serverlog.StateConnected {
			c.log.Info("reading the server log", "source", c.cfg.Logs.Source)
		}
	case serverlog.StateDown:
		if previous != serverlog.StateDown && state.err != nil {
			c.log.Warn("the server log is unavailable", "error", state.err)
		}
	case serverlog.StateEnded:
		return c.cfg.Logs.Source == config.SourceStdin
	}
	return false
}

func (c *Collector) finishOutput() {
	c.ensureStarted()
	c.log.Info("the server's output ended")
	c.markOffline(event.OfflineStopped)
}

func (c *Collector) finishProcess(exit processExit) {
	c.ensureStarted()
	c.stopMu.Lock()
	requested := c.stopping || c.expectShutdown.Load()
	killed := c.killed
	c.stopMu.Unlock()
	reason := event.OfflineStopped
	switch {
	case exit.err != nil:
		c.exitErr = fmt.Errorf("waiting for the server: %w", exit.err)
		reason = event.OfflineCrashed
	case exit.code != 0 && !requested && !killed:
		c.exitErr = fmt.Errorf("the server exited with code %d", exit.code)
		reason = event.OfflineCrashed
	}
	c.log.Info("the server exited", "code", exit.code)
	c.processState = stateOff
	c.markOffline(reason)
}
