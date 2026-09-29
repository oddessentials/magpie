package collector

import (
	"time"

	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/saves"
)

type saveOutcome struct {
	result   *saves.Result
	err      error
	modified time.Time
	size     int64
	path     string
}

func (c *Collector) savesEnabled() bool {
	return c.cfg.Saves.Reader != "" && (c.cfg.SaveDir != "" || c.cfg.Saves.Path != "")
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
		result, err := saves.Read(c.loopCtx, reader, path)
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
