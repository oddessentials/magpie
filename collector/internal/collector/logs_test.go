package collector

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/oddessentials/magpie/collector/internal/config"
	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/ingest"
	"github.com/oddessentials/magpie/collector/internal/serverlog"
)

const cleanExitLine = "[2026.09.28-22.00.00:123][119]LogCore: Engine exit requested (reason: EngineExit() was called)"

func logCollector(t *testing.T) *Collector {
	t.Helper()
	site := httptest.NewServer(&fakeSite{secret: "s"})
	t.Cleanup(site.Close)
	cfg := testConfig(t, site, map[string]string{
		"MAGPIE_LOGS_SOURCE": "file",
		"MAGPIE_LOGS_PATH":   filepath.Join(scratchDir(t), "server.log"),
	})
	c, err := New(Options{Config: cfg, OfflineAfter: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.journal.Close() })
	return c
}

func feedLog(c *Collector, text string) {
	c.onLine(serverlog.Line{Text: text, ReceivedAt: time.Now()})
}

func TestFileExitClearsPresenceAndStopStateOnce(t *testing.T) {
	c := logCollector(t)
	feedLog(c, loadedLine)
	feedLog(c, loginLine)
	feedLog(c, enteredLine)
	c.onModLine(serverlog.Line{Text: `{"type":"stop_requested","v":1}`, ReceivedAt: time.Now()})
	if len(c.mapper.Online()) != 1 || !c.expectShutdown.Load() || !c.stopSignaled {
		t.Fatal("the session must have presence and a pending stop")
	}
	feedLog(c, cleanExitLine)
	feedLog(c, cleanExitLine)
	c.onModLine(serverlog.Line{Text: `{"type":"stop_requested","v":1}`, ReceivedAt: time.Now()})
	if c.serverUp || len(c.mapper.Online()) != 0 || c.expectShutdown.Load() || c.stopSignaled || c.stopBy != "" {
		t.Fatal("clean exit must clear presence and stop state, including duplicate and late signals")
	}
	var offline []emission
	for _, item := range c.preStart {
		if item.Type == event.TypeServerOffline {
			offline = append(offline, item)
		}
	}
	wantAt, _ := serverlog.ParseTimestamp("2026.09.28-22.00.00:123")
	if len(offline) != 1 || offline[0].Data.(event.ServerOfflineData).Reason != event.OfflineStopped || !offline[0].At.Equal(wantAt) {
		t.Fatalf("one stopped event at the recorded exit time: %+v", offline)
	}
	feedLog(c, loadedLine)
	feedLog(c, loginLine)
	feedLog(c, enteredLine)
	c.onModLine(serverlog.Line{Text: `{"type":"stop_requested","v":1}`, ReceivedAt: time.Now()})
	if !c.serverUp || len(c.mapper.Online()) != 1 || !c.stopSignaled {
		t.Fatal("the next startup and stop must work without stale state")
	}
	var joins, stops int
	for _, item := range c.preStart {
		if item.Type == event.TypePlayerJoined {
			joins++
		}
		if item.Type == event.TypeServerStopping {
			stops++
		}
	}
	if joins != 2 || stops != 2 {
		t.Fatalf("new sessions must not be suppressed: joins=%d stops=%d", joins, stops)
	}
}

func TestFileTransportFailureAndInactivityAreNotCleanExits(t *testing.T) {
	c := logCollector(t)
	feedLog(c, loadedLine)
	c.onSourceState(sourceState{state: serverlog.StateDown, err: errors.New("transport failed")})
	if !c.serverUp {
		t.Fatal("losing the transport does not prove a server shutdown")
	}
	c.ensureStarted()
	c.housekeeping()
	if !c.serverUp {
		t.Fatal("ordinary inactivity must not end the session before the watchdog")
	}
	c.lastLogLine = time.Now().Add(-2 * time.Hour)
	c.housekeeping()
	if c.serverUp {
		t.Fatal("the idle watchdog still marks the server unreachable")
	}
	file, err := os.Open(filepath.Join(c.journal.Dir(), ingest.JournalFileName))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	count := 0
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var item event.Event
		if err := json.Unmarshal(scanner.Bytes(), &item); err != nil {
			t.Fatal(err)
		}
		if item.Type == event.TypeServerOffline {
			var data event.ServerOfflineData
			if err := json.Unmarshal(item.Data, &data); err != nil || data.Reason != event.OfflineUnreachable {
				t.Fatalf("watchdog reason must be unreachable: %+v, %v", data, err)
			}
			count++
		}
	}
	if err := scanner.Err(); err != nil || count != 1 {
		t.Fatalf("one watchdog event: count=%d, %v", count, err)
	}
}

func TestLogExitPreservesOtherModes(t *testing.T) {
	for _, source := range []string{config.SourceLaunch, config.SourceDocker, config.SourceStdin} {
		t.Run(source, func(t *testing.T) {
			c := logCollector(t)
			c.cfg.Logs.Source = source
			c.launched = source == config.SourceLaunch
			feedLog(c, loadedLine)
			feedLog(c, cleanExitLine)
			if !c.serverUp {
				t.Fatal("other modes keep their existing lifecycle")
			}
			if c.launched {
				c.finishProcess(processExit{code: 3})
				if c.exitErr == nil || c.serverUp {
					t.Fatal("a failed process exit must still be classified as a crash")
				}
			}
		})
	}
}

func TestFileModeFollowsCleanExitAndRestart(t *testing.T) {
	for _, replacement := range []string{"append", "rotate", "truncate"} {
		t.Run(replacement, func(t *testing.T) {
			site := &fakeSite{secret: "s"}
			server := httptest.NewServer(site)
			defer server.Close()
			path := filepath.Join(scratchDir(t), "server.log")
			appendLines(t, path, loadedLine, loginLine, enteredLine)
			cfg := testConfig(t, server, map[string]string{"MAGPIE_LOGS_SOURCE": "file", "MAGPIE_LOGS_PATH": path})
			c, err := New(Options{Config: cfg, Source: &serverlog.FileSource{Path: path, FromStart: true, Poll: 10 * time.Millisecond}, OfflineAfter: time.Hour})
			if err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithCancel(context.Background())
			done := make(chan error, 1)
			go func() { done <- c.Run(ctx, nil) }()
			defer func() {
				cancel()
				if err := <-done; err != nil {
					t.Error(err)
				}
			}()
			waitFor(t, "the first startup", func() bool { return site.has(event.TypePlayerJoined) })
			appendLines(t, path, cleanExitLine, cleanExitLine)
			waitFor(t, "prompt clean shutdown while the file remains open", func() bool {
				return site.data(event.TypeServerOffline, 0)["reason"] == event.OfflineStopped
			})
			switch replacement {
			case "rotate":
				if err := os.Rename(path, path+".old"); err != nil {
					t.Fatal(err)
				}
			case "truncate":
				if err := os.Truncate(path, 0); err != nil {
					t.Fatal(err)
				}
			}
			appendLines(t, path, loadedLine, loginLine, enteredLine)
			waitFor(t, "the next startup and fresh presence", func() bool {
				return site.data(event.TypeServerOnline, 1) != nil && site.data(event.TypePlayerJoined, 1) != nil
			})
			if site.data(event.TypeServerOffline, 1) != nil {
				t.Fatal("duplicate exits and file changes must not duplicate the offline event")
			}
		})
	}
}

func TestFileReplacementWithoutExitIsUnreachableBeforeStartup(t *testing.T) {
	c := logCollector(t)
	feedLog(c, loadedLine)
	feedLog(c, enteredLine)
	c.onLine(serverlog.Line{Reset: true, ReceivedAt: time.Now()})
	if c.serverUp || len(c.mapper.Online()) != 0 {
		t.Fatal("a replacement log invalidates the old session")
	}
	feedLog(c, loadedLine)
	last := c.preStart[len(c.preStart)-2:]
	if last[0].Type != event.TypeServerOffline || last[0].Data.(event.ServerOfflineData).Reason != event.OfflineUnreachable || last[1].Type != event.TypeServerOnline {
		t.Fatalf("the lost session must precede the new startup: %+v", last)
	}
}
