package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/oddessentials/magpie/collector/internal/config"
)

func TestDryRunKeepsItsStateInATemporaryFolder(t *testing.T) {
	journal := t.TempDir()
	cursor := filepath.Join(journal, "file.cursor")
	if err := os.WriteFile(cursor, []byte(`{"path":"server.log","offset":42}`), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{JournalDir: journal}
	cleanup, err := isolateDryRun(cfg)
	if err != nil {
		t.Fatal(err)
	}
	dir := cfg.JournalDir
	if dir == journal {
		t.Fatal("the dry run uses the real journal folder")
	}
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		t.Fatalf("temporary journal folder: %v", err)
	}
	cleanup()
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("the temporary folder is removed: %v", err)
	}
	if data, err := os.ReadFile(cursor); err != nil || string(data) != `{"path":"server.log","offset":42}` {
		t.Fatalf("the real cursor is untouched: %s %v", data, err)
	}
}
