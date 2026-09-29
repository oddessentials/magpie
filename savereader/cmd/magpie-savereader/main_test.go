package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	st "github.com/oddessentials/magpie/savereader/internal/spud/spudtest"
)

func writeSave(t *testing.T) string {
	t.Helper()
	save := st.Save{
		SystemVersion: 8,
		Timestamp:     "2026-09-28T18:14:27.756Z",
		Fields: []st.Field{
			{Name: "WorldName", Data: st.String("Test World")},
			{Name: "SessionPasswd", Data: st.String("secret")},
		},
		CurrentLevel: "L_World",
		Levels:       []st.Level{{Name: "L_World"}},
	}
	path := filepath.Join(t.TempDir(), "magpie-rig.sav")
	if err := os.WriteFile(path, save.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	written := time.Date(2026, 9, 28, 18, 14, 27, 756000000, time.UTC)
	if err := os.Chtimes(path, written, written); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestReadPrintsTheWorldAsJSON(t *testing.T) {
	path := writeSave(t)
	var stdout, stderr bytes.Buffer
	if code := run([]string{"read", path}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	var got map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	world, _ := got["world"].(map[string]any)
	if got["format"] != float64(1) || got["saved_at"] != "2026-09-28T18:14:27.756Z" || world["name"] != "Test World" {
		t.Fatalf("output %s", stdout.String())
	}
	if strings.Contains(stdout.String(), "secret") {
		t.Fatalf("the password leaked: %s", stdout.String())
	}
	for _, key := range []string{"weather", "events", "characters"} {
		if items, ok := got[key].([]any); !ok || len(items) != 0 {
			t.Fatalf("%s in an empty world: %v", key, got[key])
		}
	}
}

func TestUsageAndFailures(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if code := run([]string{"version"}, &stdout, &stderr); code != 0 || stdout.String() != "dev\n" {
		t.Fatalf("version exit %d: %q", code, stdout.String())
	}
	if code := run([]string{"read"}, &stdout, &stderr); code != 2 || !strings.Contains(stderr.String(), "Usage") {
		t.Fatalf("usage exit %d: %s", code, stderr.String())
	}
	if code := run([]string{"read", filepath.Join(t.TempDir(), "missing.sav")}, &stdout, &stderr); code != 1 {
		t.Fatalf("missing file exit %d", code)
	}
	path := writeSave(t)
	data, _ := os.ReadFile(path)
	if err := os.WriteFile(path, data[:len(data)-8], 0o644); err != nil {
		t.Fatal(err)
	}
	stderr.Reset()
	if code := run([]string{"read", path}, &stdout, &stderr); code != 1 || !strings.Contains(stderr.String(), "being written") {
		t.Fatalf("truncated exit %d: %s", code, stderr.String())
	}
}
