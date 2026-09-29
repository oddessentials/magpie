package config

import (
	"strings"
	"testing"
	"time"
)

func TestRemoteConfigurationRequiresPinnedKeysAndReportsCadence(t *testing.T) {
	values := map[string]string{"MAGPIE_LOGS_REMOTE": "sftp://user:private@host/~/server.log", "MAGPIE_LOGS_HOST_KEY": "SHA256:fixture", "MAGPIE_SAVES_REMOTE": "ftps://user@host/world.sav", "MAGPIE_SAVES_PASSWORD": "private"}
	cfg, err := Load(Options{Getenv: env(values), DryRun: true})
	if err != nil || cfg.Logs.Source != SourceRemote || cfg.Logs.Interval != 5*time.Second || cfg.Saves.Interval != 30*time.Second {
		t.Fatalf("config %v %v", cfg, err)
	}
	delete(values, "MAGPIE_LOGS_HOST_KEY")
	if _, err := Load(Options{Getenv: env(values), DryRun: true}); err == nil || strings.Contains(err.Error(), "private") {
		t.Fatalf("host key must be pinned without leaking credentials: %v", err)
	}
	values["MAGPIE_LOGS_HOST_KEY"] = "SHA256:fixture"
	values["MAGPIE_LOGS_SOURCE"] = "file"
	values["MAGPIE_LOGS_PATH"] = "local.log"
	if _, err := Load(Options{Getenv: env(values), DryRun: true}); err == nil {
		t.Fatal("remote URL silently ignored in file mode")
	}
	values["MAGPIE_LOGS_SOURCE"] = "remote"
	values["MAGPIE_SAVES_PATH"] = "local.sav"
	if _, err := Load(Options{Getenv: env(values), DryRun: true}); err == nil {
		t.Fatal("ambiguous save locations accepted")
	}
}
