package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/oddessentials/magpie/collector/internal/config"
	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/ingest"
	"github.com/oddessentials/magpie/collector/internal/serverlog"
)

type fakeSite struct {
	mu     sync.Mutex
	secret string
	events []event.Event
}

func (s *fakeSite) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	timestamp, _ := strconv.ParseInt(r.Header.Get(ingest.TimestampHeader), 10, 64)
	if !ingest.Verify(s.secret, timestamp, body, r.Header.Get(ingest.SignatureHeader)) {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `{"error":{"code":"unauthorized","message":"bad signature"}}`)
		return
	}
	var batch struct {
		Events []event.Event `json:"events"`
	}
	if err := json.Unmarshal(body, &batch); err != nil {
		w.WriteHeader(http.StatusUnprocessableEntity)
		return
	}
	s.mu.Lock()
	s.events = append(s.events, batch.Events...)
	s.mu.Unlock()
	fmt.Fprintf(w, `{"accepted":%d,"duplicates":0,"invalid":0,"last_seq":null,"actions":[]}`, len(batch.Events))
}

func (s *fakeSite) types() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(s.events))
	for _, item := range s.events {
		out = append(out, item.Type)
	}
	return out
}

func (s *fakeSite) has(kinds ...string) bool {
	seen := map[string]bool{}
	for _, kind := range s.types() {
		seen[kind] = true
	}
	for _, kind := range kinds {
		if !seen[kind] {
			return false
		}
	}
	return true
}

func (s *fakeSite) data(kind string, index int) map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	matches := 0
	for _, item := range s.events {
		if item.Type != kind {
			continue
		}
		if matches == index {
			var decoded map[string]any
			json.Unmarshal(item.Data, &decoded)
			return decoded
		}
		matches++
	}
	return nil
}

type fakeProcess struct {
	exit   chan int
	once   sync.Once
	killed atomic.Bool
}

func newFakeProcess() *fakeProcess {
	return &fakeProcess{exit: make(chan int, 1)}
}

func (p *fakeProcess) Pid() int { return 4242 }

func (p *fakeProcess) Wait() (int, error) {
	code := <-p.exit
	p.exit <- code
	return code, nil
}

func (p *fakeProcess) Kill() error {
	p.killed.Store(true)
	p.finish(1)
	return nil
}

func (p *fakeProcess) finish(code int) {
	p.once.Do(func() { p.exit <- code })
}

func (p *fakeProcess) MemoryBytes() (uint64, bool) { return 512 << 20, true }

func (p *fakeProcess) Close() error { return nil }

func scratchDir(t *testing.T) string {
	t.Helper()
	dir, err := os.MkdirTemp("", "magpie-collector")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for range 50 {
			if os.RemoveAll(dir) == nil {
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
	})
	return dir
}

func waitFor(t *testing.T, what string, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func appendLines(t *testing.T, path string, lines ...string) {
	t.Helper()
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	for _, line := range lines {
		if _, err := file.WriteString(line + "\n"); err != nil {
			t.Fatal(err)
		}
	}
}

const (
	loadedLine  = `[2026.09.28-21.50.26:306][119]LogPersistence: [DedicatedServer] PostLoadWorldState() : World load SUCCEEDED (slot: Test World) (Guid[1234567890ABCDEF1234567890ABCDEF] WorldName[Test World] SlotName[Test World] MapName[L_World] - OwnerGuid[] OwnerName[])`
	loginLine   = `[2026.09.28-21.57.46:054][400]LogNet: Login request: ?p=aHVudGVyMg==?pf=PC?cpx=1?c?Name=Wanderer userId: RedpointEOS:00000000000000000000000000000abc platform: RedpointEOS`
	enteredLine = `[2026.09.28-21.57.53:701][629]LogDominionPlayerControllerBase: PlayerChar entered world [Account[XP:00000000000000000000000000000abc] Character Name[Wanderer] Guid[DCG:ABCDEF0123456789ABCDEF0123456789] Type[0]]`
	chatLine    = `{"ChatMessageData":{"MessageBody":"hello there","SenderData":{"PlayerId":256}},"ChatPlayerFilterData":{"ReceiverIds":"[0]"},"hook":"/Script/JagexChatBackend.PlayerChatComponent:Server_SendChatMessage","player_name":"Wanderer","self":"PlayerChatComponent /Game/X","ts":"2026-09-28T22:41:29Z","type":"chat","v":1}`
)

func testConfig(t *testing.T, site *httptest.Server, values map[string]string) *config.Config {
	t.Helper()
	dir := scratchDir(t)
	env := map[string]string{
		"MAGPIE_SITE_URL":            site.URL,
		"MAGPIE_SITE_SECRET":         "s",
		"MAGPIE_JOURNAL_DIR":         filepath.Join(dir, "journal"),
		"MAGPIE_INTERVALS_FLUSH":     "1s",
		"MAGPIE_INTERVALS_HEARTBEAT": "1s",
		"MAGPIE_INTERVALS_METRICS":   "1s",
	}
	for key, value := range values {
		env[key] = value
	}
	cfg, err := config.Load(config.Options{Getenv: func(name string) string { return env[name] }, Platform: runtime.GOOS})
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestFileModeEndToEnd(t *testing.T) {
	site := &fakeSite{secret: "s"}
	server := httptest.NewServer(site)
	defer server.Close()
	dir := scratchDir(t)
	logPath := filepath.Join(dir, "RSDragonwilds.log")
	events := filepath.Join(dir, "magpie-events.jsonl")
	if err := os.WriteFile(logPath, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := testConfig(t, server, map[string]string{"MAGPIE_LOGS_SOURCE": "file", "MAGPIE_LOGS_PATH": logPath, "MAGPIE_MOD_EVENTS": events})
	c, err := New(Options{Config: cfg, Source: &serverlog.FileSource{Path: logPath, FromStart: true}, StartupWait: 200 * time.Millisecond, OfflineAfter: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	done := make(chan error, 1)
	go func() { done <- c.Run(ctx, make(chan struct{})) }()
	appendLines(t, logPath, loadedLine, loginLine, enteredLine)
	appendLines(t, events, chatLine)
	waitFor(t, "the session events", func() bool {
		return site.has(event.TypeCollectorStarted, event.TypeServerOnline, event.TypePlayerJoined, event.TypeChatMessage, event.TypeCollectorHeartbeat)
	})
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	kinds := site.types()
	if kinds[0] != event.TypeCollectorStarted {
		t.Fatalf("the started event comes first: %v", kinds)
	}
	online := site.data(event.TypeServerOnline, 0)
	if online["world_name"] != "Test World" || online["world_guid"] != "1234567890ABCDEF1234567890ABCDEF" {
		t.Fatalf("online %+v", online)
	}
	chat := site.data(event.TypeChatMessage, 0)
	if chat["text"] != "hello there" || chat["user_id"] != "00000000000000000000000000000abc" || chat["name"] != "Wanderer" {
		t.Fatalf("chat %+v", chat)
	}
	if !site.has(event.TypeServerOffline) || site.data(event.TypeServerOffline, 0)["reason"] != event.OfflineCollectorStopping {
		t.Fatalf("offline %v", site.types())
	}
	heartbeat := site.data(event.TypeCollectorHeartbeat, 0)
	if heartbeat["process"] != stateOff || heartbeat["mod"] == stateOff || heartbeat["saves"] != stateOff {
		t.Fatalf("heartbeat %+v", heartbeat)
	}
}

func launchConfig(t *testing.T, server *httptest.Server, dir, logPath string, stopWait string) *config.Config {
	t.Helper()
	command := filepath.Join(dir, "server.exe")
	os.WriteFile(command, []byte("x"), 0o755)
	return testConfig(t, server, map[string]string{
		"MAGPIE_LOGS_SOURCE":      "launch",
		"MAGPIE_LAUNCH_COMMAND":   command,
		"MAGPIE_LOGS_PATH":        logPath,
		"MAGPIE_MOD_EVENTS":       filepath.Join(dir, "magpie-events.jsonl"),
		"MAGPIE_MOD_STOP":         filepath.Join(dir, "magpie-stop.txt"),
		"MAGPIE_LAUNCH_STOP_WAIT": stopWait,
	})
}

func TestLaunchModeStopsThroughTheMod(t *testing.T) {
	site := &fakeSite{secret: "s"}
	server := httptest.NewServer(site)
	defer server.Close()
	dir := scratchDir(t)
	logPath := filepath.Join(dir, "RSDragonwilds.log")
	os.WriteFile(logPath, nil, 0o644)
	cfg := launchConfig(t, server, dir, logPath, "10s")
	process := newFakeProcess()
	c, err := New(Options{Config: cfg, Source: &serverlog.FileSource{Path: logPath, FromStart: true}, Process: process, StartupWait: 200 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	done := make(chan error, 1)
	go func() { done <- c.Run(ctx, make(chan struct{})) }()
	appendLines(t, logPath, loadedLine)
	waitFor(t, "the server online and metrics", func() bool { return site.has(event.TypeServerOnline, event.TypeServerMetrics) })
	pid, err := os.ReadFile(PidFile(cfg.JournalDir))
	if err != nil || strings.TrimSpace(string(pid)) != "4242" {
		t.Fatalf("pid file %q %v", pid, err)
	}
	cancel()
	waitFor(t, "the stop file", func() bool {
		data, err := os.ReadFile(cfg.Mod.Stop)
		return err == nil && strings.TrimSpace(string(data)) == stopByCollector
	})
	appendLines(t, cfg.Mod.Events,
		`{"file":"x","ts":"2026-09-28T23:36:04Z","type":"stop_requested","v":1}`,
		`{"SlotName":"Test World","bSuccess":true,"hook":"/Script/Dominion.PersistenceSubsystem:PostSaveWorldState","self":"PersistenceSubsystem /Engine/Transient.X","ts":"2026-09-28T23:36:04Z","type":"save_done","v":1}`)
	waitFor(t, "the save to be reported", func() bool {
		second := site.data(event.TypeServerStopping, 1)
		return second != nil && second["save"] == event.SaveDone
	})
	process.finish(0)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if process.killed.Load() {
		t.Fatal("a server that exits after the save is not killed")
	}
	first := site.data(event.TypeServerStopping, 0)
	if first["by"] != stopByCollector || first["save"] != event.SaveRequested {
		t.Fatalf("stopping %+v", first)
	}
	if site.data(event.TypeServerOffline, 0)["reason"] != event.OfflineStopped {
		t.Fatalf("offline %+v", site.data(event.TypeServerOffline, 0))
	}
	if _, err := os.Stat(PidFile(cfg.JournalDir)); err == nil {
		t.Fatal("the pid file goes when the collector exits")
	}
	metrics := site.data(event.TypeServerMetrics, 0)
	if metrics["memory_mb"] != 512.0 {
		t.Fatalf("metrics %+v", metrics)
	}
}

func TestLaunchModeKillsWhenTheModDoesNotAnswer(t *testing.T) {
	site := &fakeSite{secret: "s"}
	server := httptest.NewServer(site)
	defer server.Close()
	dir := scratchDir(t)
	logPath := filepath.Join(dir, "RSDragonwilds.log")
	os.WriteFile(logPath, nil, 0o644)
	cfg := launchConfig(t, server, dir, logPath, "1s")
	process := newFakeProcess()
	c, err := New(Options{Config: cfg, Source: &serverlog.FileSource{Path: logPath, FromStart: true}, Process: process, StartupWait: 200 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	done := make(chan error, 1)
	go func() { done <- c.Run(ctx, make(chan struct{})) }()
	appendLines(t, logPath, loadedLine)
	waitFor(t, "the server online", func() bool { return site.has(event.TypeServerOnline) })
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if !process.killed.Load() {
		t.Fatal("the server is terminated after the wait")
	}
	if site.data(event.TypeServerOffline, 0)["reason"] != event.OfflineStopped {
		t.Fatalf("offline %+v", site.data(event.TypeServerOffline, 0))
	}
}

func TestAnAdminStopFileIsAttributed(t *testing.T) {
	site := &fakeSite{secret: "s"}
	server := httptest.NewServer(site)
	defer server.Close()
	dir := scratchDir(t)
	logPath := filepath.Join(dir, "RSDragonwilds.log")
	os.WriteFile(logPath, nil, 0o644)
	cfg := launchConfig(t, server, dir, logPath, "10s")
	process := newFakeProcess()
	c, err := New(Options{Config: cfg, Source: &serverlog.FileSource{Path: logPath, FromStart: true}, Process: process, StartupWait: 200 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- c.Run(context.Background(), make(chan struct{})) }()
	appendLines(t, logPath, loadedLine)
	waitFor(t, "the server online", func() bool { return site.has(event.TypeServerOnline) })
	if err := WriteStopFile(cfg.Mod.Stop, stopByAdmin); err != nil {
		t.Fatal(err)
	}
	appendLines(t, cfg.Mod.Events, `{"file":"x","ts":"2026-09-28T23:36:04Z","type":"stop_requested","v":1}`)
	waitFor(t, "the stop to be attributed", func() bool { return site.has(event.TypeServerStopping) })
	process.finish(0)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if site.data(event.TypeServerStopping, 0)["by"] != stopByAdmin {
		t.Fatalf("stopping %+v", site.data(event.TypeServerStopping, 0))
	}
	if site.data(event.TypeServerOffline, 0)["reason"] != event.OfflineStopped {
		t.Fatalf("a requested exit is a stop, not a crash: %+v", site.data(event.TypeServerOffline, 0))
	}
}
