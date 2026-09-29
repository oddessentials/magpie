package collector

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/remote/remotetest"
	"github.com/oddessentials/magpie/collector/internal/saves"
	"golang.org/x/crypto/ssh"
)

func TestRemoteLogsAndSavesReachTheJournalAndSite(t *testing.T) {
	site := &fakeSite{secret: "s"}
	server := httptest.NewServer(site)
	defer server.Close()
	root := scratchDir(t)
	logPath := filepath.Join(root, "server.log")
	savePath := filepath.Join(root, "world.sav")
	os.WriteFile(logPath, []byte(loadedLine+"\n"), 0600)
	raw := make([]byte, 16)
	copy(raw, "SAVE")
	binary.LittleEndian.PutUint32(raw[4:], 8)
	copy(raw[8:], "complete")
	os.WriteFile(savePath, raw, 0600)
	savedAt := time.Date(2026, 9, 28, 15, 0, 0, 0, time.UTC)
	os.Chtimes(savePath, savedAt, savedAt)
	key := remotetest.HostKey(t)
	address := remotetest.StartSFTP(t, root, "user", "private", key)
	reader := filepath.Join(root, "reader")
	os.WriteFile(reader, nil, 0600)
	cfg := testConfig(t, server, map[string]string{"MAGPIE_LOGS_SOURCE": "remote", "MAGPIE_LOGS_REMOTE": "sftp://user@" + address + "/~/server.log", "MAGPIE_LOGS_PASSWORD": "private", "MAGPIE_LOGS_HOST_KEY": ssh.FingerprintSHA256(key.PublicKey()), "MAGPIE_SAVES_REMOTE": "sftp://user@" + address + "/~/world.sav", "MAGPIE_SAVES_PASSWORD": "private", "MAGPIE_SAVES_HOST_KEY": ssh.FingerprintSHA256(key.PublicKey()), "MAGPIE_SAVES_READER": reader})
	cfg.Logs.Interval = 30 * time.Millisecond
	cfg.Saves.Interval = 50 * time.Millisecond
	cfg.Intervals.Heartbeat = 50 * time.Millisecond
	read := func(_ context.Context, _ string, file string) (*saves.Result, error) {
		data, err := os.ReadFile(file)
		if err != nil {
			return nil, err
		}
		if string(data[8:]) != "complete" {
			return nil, errors.New("invalid save body")
		}
		return &saves.Result{SavedAt: savedAt, World: event.SaveWorldData{SavedAt: savedAt, WorldGUID: "1234567890ABCDEF1234567890ABCDEF", Weather: []event.SaveWeather{}, Events: []event.SaveWorldTrigger{}}, Characters: []event.SavePlayerData{}, GUIDs: []string{}}, nil
	}
	c, err := New(Options{Config: cfg, StartupWait: time.Millisecond, ReadSave: read})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- c.Run(ctx, make(chan struct{})) }()
	waitFor(t, "remote save and log ingest", func() bool { return site.has(event.TypeServerOnline, event.TypeSaveWorld, event.TypeSaveRead) })
	waitFor(t, "successful remote poll heartbeat", func() bool {
		return site.any(event.TypeCollectorHeartbeat, func(data map[string]any) bool {
			r, ok := data["remote"].(map[string]any)
			return ok && r["logs_checked_at"] != nil && r["saves_checked_at"] != nil
		})
	})
	appendLines(t, logPath, cleanExitLine, cleanExitLine)
	waitFor(t, "one clean stop", func() bool { return site.has(event.TypeServerOffline) })
	if site.data(event.TypeServerOffline, 0)["reason"] != event.OfflineStopped {
		t.Fatal("remote shutdown was misclassified")
	}
	appendLines(t, logPath, loadedLine)
	waitFor(t, "restart after remote shutdown", func() bool { return site.data(event.TypeServerOnline, 1) != nil })
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(site.data(event.TypeCollectorStarted, 0)["layers"])
	if strings.Contains(string(data), address) || strings.Contains(string(data), "private") {
		t.Fatal("remote connection details escaped into observation metadata")
	}
	data, _ = os.ReadFile(filepath.Join(cfg.JournalDir, "remote-world.sav"))
	if string(data) != string(raw) {
		t.Fatal("validated remote copy missing")
	}
}
