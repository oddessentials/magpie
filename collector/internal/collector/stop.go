package collector

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/oddessentials/magpie/collector/internal/event"
)

const (
	PidFileName     = "server.pid"
	stopByCollector = "collector"
	stopByAdmin     = "admin"
	stopByUnknown   = "unknown"
)

var errNoStopFile = errors.New("no mod.stop file is configured, so the server cannot be asked to save and stop; without the events mod the only stop is a kill")

func PidFile(journalDir string) string {
	return filepath.Join(journalDir, PidFileName)
}

func WriteStopFile(path, by string) error {
	if path == "" {
		return errNoStopFile
	}
	return os.WriteFile(path, []byte(by+"\n"), 0o644)
}

func StopFileBy(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return stopByUnknown
	}
	return stopRequester(string(data))
}

func stopRequester(text string) string {
	switch by := strings.TrimSpace(text); by {
	case stopByCollector, stopByAdmin:
		return by
	}
	return stopByUnknown
}

func (c *Collector) resetStop() {
	c.expectShutdown.Store(false)
	c.stopMu.Lock()
	c.stopSignaled = false
	c.stopBy = ""
	c.stopSave = ""
	c.stopMu.Unlock()
}

func (c *Collector) writePid() {
	if !c.launched || c.process == nil {
		return
	}
	if err := os.WriteFile(PidFile(c.cfg.JournalDir), []byte(strconv.Itoa(c.process.Pid())+"\n"), 0o644); err != nil {
		c.log.Warn("writing the server pid file failed", "error", err)
	}
}

func (c *Collector) removePid() {
	if c.launched {
		os.Remove(PidFile(c.cfg.JournalDir))
	}
}

func (c *Collector) beginStop() bool {
	if !c.launched {
		c.drainLines()
		c.ensureStarted()
		c.markOffline(event.OfflineCollectorStopping)
		c.log.Info("stopping")
		return false
	}
	c.stopMu.Lock()
	c.stopping = true
	c.stopBy = stopByCollector
	c.stopMu.Unlock()
	c.expectShutdown.Store(true)
	if err := WriteStopFile(c.cfg.Mod.Stop, stopByCollector); err != nil {
		c.log.Warn("stopping without a save; terminating the server", "error", err)
		c.kill()
		c.stopMu.Lock()
		c.stopDeadline = time.Now().Add(killWait)
		c.stopMu.Unlock()
		return true
	}
	c.log.Info("stopping: asked the server mod to save the world and quit", "wait", c.cfg.Launch.StopWait.String())
	c.stopMu.Lock()
	c.stopDeadline = time.Now().Add(c.cfg.Launch.StopWait)
	c.stopSignaled = true
	c.stopMu.Unlock()
	c.emit(event.TypeServerStopping, time.Now(), nil, event.ServerStoppingData{By: event.String(stopByCollector), Save: event.String(event.SaveRequested)})
	return true
}

func (c *Collector) forceStop() {
	c.stopMu.Lock()
	forced := c.forced
	c.forced = true
	c.stopMu.Unlock()
	if forced || c.process == nil {
		return
	}
	c.log.Warn("forcing the server to stop without saving")
	c.kill()
}

func (c *Collector) kill() {
	c.stopMu.Lock()
	if c.killed || c.process == nil {
		c.stopMu.Unlock()
		return
	}
	c.killed = true
	process := c.process
	c.stopMu.Unlock()
	if err := process.Kill(); err != nil {
		c.log.Warn("terminating the server failed", "error", err)
	}
}
