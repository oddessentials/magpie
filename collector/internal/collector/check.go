package collector

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/oddessentials/magpie/collector/internal/buildinfo"
	"github.com/oddessentials/magpie/collector/internal/config"
	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/ingest"
	"github.com/oddessentials/magpie/collector/internal/saves"
	"github.com/oddessentials/magpie/collector/internal/serverlog"
)

func fileSize(bytes int64) string {
	if bytes < 1<<20 {
		return fmt.Sprintf("%d KB", (bytes+1023)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(bytes)/(1<<20))
}

func Check(ctx context.Context, cfg *config.Config, out io.Writer) int {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	failed := false
	line := func(area, status, detail string) {
		fmt.Fprintf(out, "%-9s %-5s %s\n", area, status, detail)
	}
	switch {
	case cfg.Dragonwilds.ServerDir == "":
		line("server", "note", "dragonwilds.server_dir is not set; the server name, world name and save folder are unknown")
	case cfg.ServerIni == nil:
		line("server", "WARN", cfg.Dragonwilds.ServerDir+": no DedicatedServer.ini yet; the server writes it on its first start")
	default:
		line("server", "ok", fmt.Sprintf("%s, world %q (%s)", cfg.ServerIni.ServerName, cfg.ServerIni.DefaultWorldName, cfg.ServerIni.Path))
	}
	switch cfg.Logs.Source {
	case config.SourceLaunch:
		if _, err := os.Stat(cfg.Launch.Command); err != nil {
			failed = true
			line("logs", "FAIL", fmt.Sprintf("launch.command: %v", err))
		} else {
			line("logs", "ok", "launch "+cfg.Launch.Command+", log "+cfg.LogPath)
		}
	case config.SourceDocker:
		running, err := serverlog.InspectContainer(ctx, cfg.Docker.Host, cfg.Docker.Container)
		switch {
		case err != nil:
			failed = true
			line("logs", "FAIL", err.Error())
		case !running:
			line("logs", "WARN", fmt.Sprintf("container %q is not running", cfg.Docker.Container))
		default:
			line("logs", "ok", fmt.Sprintf("docker container %q is running", cfg.Docker.Container))
		}
	case config.SourceFile:
		if info, err := os.Stat(cfg.LogPath); err != nil {
			line("logs", "WARN", err.Error())
		} else {
			line("logs", "ok", fmt.Sprintf("file %s (%s)", cfg.LogPath, fileSize(info.Size())))
		}
	default:
		line("logs", "ok", cfg.Logs.Source)
	}
	switch {
	case cfg.Mod.Events == "":
		line("mod", "off", "no events file is set; chat, quests, crafting and building need the events mod")
	default:
		detail := cfg.Mod.Events
		if info, err := os.Stat(cfg.Mod.Events); err == nil {
			detail += fmt.Sprintf(" (%s)", fileSize(info.Size()))
		} else if _, err := os.Stat(filepath.Dir(cfg.Mod.Events)); err != nil {
			line("mod", "WARN", fmt.Sprintf("the folder for %s does not exist", cfg.Mod.Events))
			break
		}
		if cfg.Mod.Stop != "" {
			detail += ", stop file " + cfg.Mod.Stop
		}
		line("mod", "ok", detail)
	}
	switch {
	case cfg.Saves.Reader == "":
		line("saves", "off", "no save reader beside the collector")
	case cfg.SaveDir == "" && cfg.Saves.Path == "":
		line("saves", "WARN", "the world save folder is unknown; set dragonwilds.server_dir or saves.path")
	default:
		path := cfg.Saves.Path
		found := path != ""
		if !found {
			path, found = saves.Locate(cfg.SaveDir, cfg.WorldName())
		}
		if !found {
			line("saves", "WARN", "no .sav in "+cfg.SaveDir)
			break
		}
		modified, size, err := saves.Modified(path)
		if err != nil {
			line("saves", "WARN", err.Error())
			break
		}
		line("saves", "ok", fmt.Sprintf("%s, %s, written %s", path, fileSize(size), modified.UTC().Format(time.RFC3339)))
	}
	if cfg.Site.URL == "" || cfg.Site.Secret == "" {
		failed = true
		line("site", "FAIL", "site.url and site.secret are required")
	} else {
		result, err := ingest.Probe(ctx, cfg.IngestURL(), cfg.Site.Secret, ingest.CollectorInfo{
			Name:    CollectorName,
			Version: buildinfo.Version,
			RunID:   event.NewUUID(),
			OS:      runtime.GOOS,
			Arch:    runtime.GOARCH,
		})
		if err != nil {
			failed = true
			line("site", "FAIL", fmt.Sprintf("%s: %v", cfg.IngestURL(), err))
		} else {
			line("site", "ok", fmt.Sprintf("%s accepted a signed empty batch (%d pending actions)", cfg.IngestURL(), len(result.Actions)))
		}
	}
	if failed {
		return 1
	}
	return 0
}
