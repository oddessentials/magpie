package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func env(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}

func writeServer(t *testing.T, dir, platform string) {
	t.Helper()
	configDir := filepath.Join(dir, "RSDragonwilds", "Saved", "Config", platform)
	for _, path := range []string{configDir, filepath.Join(dir, "RSDragonwilds", "Binaries", "Win64"), filepath.Join(dir, "RSDragonwilds", "Saved", "SaveGames"), filepath.Join(dir, "RSDragonwilds", "Saved", "Logs")} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	ini := strings.Join([]string{
		";METADATA=(Diff=true, UseCommands=true)",
		"[/Script/Dominion.DedicatedServerSettings]",
		"OwnerId=0123456789abcdef0123456789abcdef",
		"ServerGuid=ABCDEF0123456789ABCDEF0123456789",
		"ServerName=Test Server",
		"WorldPassword=hunter2",
		"DefaultWorldName=Test World",
		"AdminPassword=hunter3",
		"PlatformPolicy=Crossplay",
		"bAllowSendingCrashDumps=True",
		"",
	}, "\r\n")
	if err := os.WriteFile(filepath.Join(configDir, "DedicatedServer.ini"), []byte(ini), 0o644); err != nil {
		t.Fatal(err)
	}
	engine := "[SystemSettings]\r\ndom.StateSaveFrequencyMins=7\r\n"
	if err := os.WriteFile(filepath.Join(configDir, "Engine.ini"), []byte(engine), 0o644); err != nil {
		t.Fatal(err)
	}
	exe := filepath.Join(dir, "RSDragonwilds", "Binaries", "Win64", "RSDragonwildsServer-Win64-Shipping.exe")
	if err := os.WriteFile(exe, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestLoadFileEnvAndServerIni(t *testing.T) {
	dir := t.TempDir()
	serverDir := filepath.Join(dir, "server")
	writeServer(t, serverDir, "WindowsServer")
	configPath := filepath.Join(dir, "magpie-collector.toml")
	content := strings.Join([]string{
		`[site]`,
		`url = "https://magpie.example"`,
		`secret = "file-secret"`,
		`[dragonwilds]`,
		`server_dir = "` + strings.ReplaceAll(serverDir, `\`, `\\`) + `"`,
		`[intervals]`,
		`heartbeat = "45s"`,
		"",
	}, "\n")
	if err := os.WriteFile(configPath, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(Options{Path: configPath, Getenv: env(map[string]string{"MAGPIE_SITE_URL": "https://override.example/"}), Platform: "windows"})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Site.URL != "https://override.example/" || cfg.IngestURL() != "https://override.example/api/ingest" || cfg.Site.Secret != "file-secret" {
		t.Fatalf("site %+v", cfg.Site)
	}
	if cfg.Logs.Source != SourceFile || cfg.LogPath != filepath.Join(serverDir, "RSDragonwilds", "Saved", "Logs", "RSDragonwilds.log") {
		t.Fatalf("logs %s %s", cfg.Logs.Source, cfg.LogPath)
	}
	if cfg.SaveDir != filepath.Join(serverDir, "RSDragonwilds", "Saved", "SaveGames") {
		t.Fatalf("save dir %s", cfg.SaveDir)
	}
	if cfg.ServerIni == nil || cfg.ServerIni.ServerName != "Test Server" || cfg.ServerIni.DefaultWorldName != "Test World" || cfg.ServerIni.PlatformPolicy != "Crossplay" || cfg.ServerIni.SaveFrequencyMin == nil || *cfg.ServerIni.SaveFrequencyMin != 7 {
		t.Fatalf("ini %+v", cfg.ServerIni)
	}
	if cfg.ServerName() != "Test Server" || cfg.WorldName() != "Test World" {
		t.Fatal("names")
	}
	if cfg.Intervals.Heartbeat != 45*time.Second || cfg.Intervals.Flush != 2*time.Second || cfg.Saves.Interval != 30*time.Second {
		t.Fatalf("intervals %+v", cfg.Intervals)
	}
	if cfg.JournalDir != filepath.Join(dir, "magpie-journal") {
		t.Fatalf("journal %s", cfg.JournalDir)
	}
}

func TestLaunchModeDerivesTheServerAndTheModFiles(t *testing.T) {
	dir := t.TempDir()
	serverDir := filepath.Join(dir, "server")
	writeServer(t, serverDir, "WindowsServer")
	events := filepath.Join(dir, "ue4ss", EventsFileName)
	stop := filepath.Join(dir, "ue4ss", StopFileName)
	exe := filepath.Join(serverDir, "RSDragonwilds", "Binaries", "Win64", "RSDragonwildsServer-Win64-Shipping.exe")
	cfg, err := Load(Options{Getenv: env(map[string]string{
		"MAGPIE_SITE_URL":       "https://magpie.example",
		"MAGPIE_SITE_SECRET":    "s",
		"MAGPIE_LAUNCH_COMMAND": exe,
		"MAGPIE_LAUNCH_ARGS":    `-log "-port=7787"`,
		"MAGPIE_MOD_EVENTS":     events,
		"MAGPIE_MOD_STOP":       stop,
	}), Platform: "windows"})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Logs.Source != SourceLaunch || cfg.Dragonwilds.ServerDir != serverDir || cfg.LogPath == "" {
		t.Fatalf("launch %+v log %s", cfg.Logs, cfg.LogPath)
	}
	if strings.Join(cfg.Launch.Args, " ") != "-log -port=7787" {
		t.Fatalf("args %v", cfg.Launch.Args)
	}
	if cfg.Mod.Events != events || cfg.Mod.Stop != stop {
		t.Fatalf("mod %+v", cfg.Mod)
	}
	if cfg.Launch.StopWait != 90*time.Second {
		t.Fatalf("stop wait %s", cfg.Launch.StopWait)
	}
	for _, warning := range cfg.Warnings {
		if strings.Contains(warning, "mod.stop") {
			t.Fatalf("with a stop file set there is no warning: %s", warning)
		}
	}
	cfg, err = Load(Options{Getenv: env(map[string]string{
		"MAGPIE_SITE_URL":       "https://magpie.example",
		"MAGPIE_SITE_SECRET":    "s",
		"MAGPIE_LAUNCH_COMMAND": exe,
	}), Platform: "windows"})
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Warnings) == 0 || !strings.Contains(cfg.Warnings[len(cfg.Warnings)-1], "mod.stop") {
		t.Fatalf("launch mode without a stop file warns: %v", cfg.Warnings)
	}
}

func TestValidationErrors(t *testing.T) {
	cases := []struct {
		name   string
		values map[string]string
		want   string
	}{
		{"site", map[string]string{"MAGPIE_LOGS_SOURCE": "stdin"}, "site.url is required"},
		{"launch", map[string]string{"MAGPIE_SITE_URL": "https://x.example", "MAGPIE_SITE_SECRET": "s", "MAGPIE_LOGS_SOURCE": "launch"}, "launch.command is empty"},
		{"docker", map[string]string{"MAGPIE_SITE_URL": "https://x.example", "MAGPIE_SITE_SECRET": "s", "MAGPIE_LOGS_SOURCE": "docker"}, "docker.container is empty"},
		{"nothing", map[string]string{"MAGPIE_SITE_URL": "https://x.example", "MAGPIE_SITE_SECRET": "s"}, "nothing to read"},
		{"interval", map[string]string{"MAGPIE_SITE_URL": "https://x.example", "MAGPIE_SITE_SECRET": "s", "MAGPIE_LOGS_SOURCE": "stdin", "MAGPIE_INTERVALS_HEARTBEAT": "500ms"}, "at least 1s"},
		{"url", map[string]string{"MAGPIE_SITE_URL": "ftp://x", "MAGPIE_SITE_SECRET": "s", "MAGPIE_LOGS_SOURCE": "stdin"}, "must be an http or https URL"},
	}
	for _, entry := range cases {
		_, err := Load(Options{Getenv: env(entry.values), Platform: "linux"})
		if err == nil || !strings.Contains(err.Error(), entry.want) {
			t.Errorf("%s: got %v, want %q", entry.name, err, entry.want)
		}
	}
	if _, err := Load(Options{Getenv: env(map[string]string{"MAGPIE_LOGS_SOURCE": "stdin"}), DryRun: true, Platform: "linux"}); err != nil {
		t.Fatalf("a dry run needs no site: %v", err)
	}
}

func TestUnknownKeysAreRefused(t *testing.T) {
	path := filepath.Join(t.TempDir(), "magpie-collector.toml")
	os.WriteFile(path, []byte("[site]\nurl = \"https://x.example\"\nsecret = \"s\"\n[palworld]\nrest_url = \"x\"\n"), 0o644)
	if _, err := Load(Options{Path: path, Getenv: env(nil)}); err == nil || !strings.Contains(err.Error(), "unknown keys") {
		t.Fatalf("got %v", err)
	}
}

func TestSplitArgs(t *testing.T) {
	args, err := SplitArgs(`-log "-port=7787" ["x"]`)
	if err != nil || strings.Join(args, "|") != `-log|-port=7787|[x]` {
		t.Fatalf("%v %v", args, err)
	}
	args, err = SplitArgs(`["-log", "-port=7787"]`)
	if err != nil || strings.Join(args, "|") != "-log|-port=7787" {
		t.Fatalf("%v %v", args, err)
	}
	if _, err := SplitArgs(`"unterminated`); err == nil {
		t.Fatal("unterminated quote")
	}
}
