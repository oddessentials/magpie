package serverlog

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type recordingSink struct {
	mu     sync.Mutex
	lines  []string
	states []State
	resets int
}

func (s *recordingSink) Line(line Line) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if line.Reset {
		s.resets++
		return
	}
	s.lines = append(s.lines, line.Text)
}

func (s *recordingSink) State(state State, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.states = append(s.states, state)
}

func (s *recordingSink) texts() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return strings.Join(s.lines, "|")
}

func waitFor(t *testing.T, what string, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func appendText(t *testing.T, path, text string) {
	t.Helper()
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if _, err := file.WriteString(text); err != nil {
		t.Fatal(err)
	}
}

func scratchDir(t *testing.T) string {
	t.Helper()
	dir, err := os.MkdirTemp("", "magpie-source")
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

func TestFileSourceReadsFromTheStartAndFollowsARotation(t *testing.T) {
	dir := scratchDir(t)
	path := filepath.Join(dir, "RSDragonwilds.log")
	appendText(t, path, "LogInit: Build: one\r\n[2026.09.28-21.50.20:303][  0]LogNet: listening\r\n")
	sink := &recordingSink{}
	source := &FileSource{Path: path, Poll: 20 * time.Millisecond, FromStart: true}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		source.Run(ctx, sink)
	}()
	waitFor(t, "the first lines", func() bool {
		return sink.texts() == "LogInit: Build: one|[2026.09.28-21.50.20:303][  0]LogNet: listening"
	})
	appendText(t, path, "partial")
	time.Sleep(60 * time.Millisecond)
	appendText(t, path, " line\n")
	waitFor(t, "the completed line", func() bool { return strings.HasSuffix(sink.texts(), "|partial line") })
	if err := os.Rename(path, path+".previous"); err != nil {
		t.Fatal(err)
	}
	appendText(t, path, "LogInit: Build: two\n")
	waitFor(t, "the new file after the rotation", func() bool { return strings.HasSuffix(sink.texts(), "|LogInit: Build: two") })
	cancel()
	<-done
	if sink.resets != 1 {
		t.Fatalf("rotation must report one reset: %d", sink.resets)
	}
}

func TestFileSourceDiscardsPartialLinesOnTruncation(t *testing.T) {
	dir := scratchDir(t)
	path := filepath.Join(dir, "server.log")
	appendText(t, path, "first\n"+strings.Repeat("unfinished", 100))
	sink := &recordingSink{}
	source := &FileSource{Path: path, Poll: 10 * time.Millisecond, FromStart: true}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		source.Run(ctx, sink)
	}()
	defer func() { cancel(); <-done }()
	waitFor(t, "the complete line", func() bool { return sink.texts() == "first" })
	if err := os.WriteFile(path, []byte("restarted\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the new file without the old partial line", func() bool { return sink.texts() == "first|restarted" })
	sink.mu.Lock()
	defer sink.mu.Unlock()
	if sink.resets != 1 {
		t.Fatalf("truncation must report one reset: %d", sink.resets)
	}
}

func TestFileSourceTailsAnExistingFileByDefault(t *testing.T) {
	dir := scratchDir(t)
	path := filepath.Join(dir, "RSDragonwilds.log")
	appendText(t, path, "old line\n")
	sink := &recordingSink{}
	source := &FileSource{Path: path, Poll: 20 * time.Millisecond, CursorPath: filepath.Join(dir, "cursor")}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		source.Run(ctx, sink)
	}()
	waitFor(t, "the source to connect", func() bool {
		sink.mu.Lock()
		defer sink.mu.Unlock()
		for _, state := range sink.states {
			if state == StateConnected {
				return true
			}
		}
		return false
	})
	appendText(t, path, "new line\n")
	waitFor(t, "the new line only", func() bool { return sink.texts() == "new line" })
	cancel()
	<-done
	if _, err := os.Stat(filepath.Join(dir, "cursor")); err != nil {
		t.Fatalf("the cursor is saved on exit: %v", err)
	}
}
