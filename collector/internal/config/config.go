package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/BurntSushi/toml"
	"github.com/oddessentials/magpie/collector/internal/remote"
)

const DefaultFileName = "magpie-collector.toml"

const (
	SourceLaunch = "launch"
	SourceDocker = "docker"
	SourceFile   = "file"
	SourceRemote = "remote"
	SourceStdin  = "stdin"
	SourceNone   = "none"
)

const (
	EventsFileName = "magpie-events.jsonl"
	StopFileName   = "magpie-stop.txt"
	LogFileName    = "RSDragonwilds.log"
)

type Site struct {
	URL    string `toml:"url"`
	Secret string `toml:"secret"`
}

type Dragonwilds struct {
	ServerDir string `toml:"server_dir"`
}

type Logs struct {
	Source   string        `toml:"source"`
	Path     string        `toml:"path"`
	Remote   string        `toml:"remote"`
	Password string        `toml:"password"`
	Key      string        `toml:"key"`
	HostKey  string        `toml:"host_key"`
	Interval time.Duration `toml:"interval"`
	Timeout  time.Duration `toml:"timeout"`
}

type Launch struct {
	Command  string        `toml:"command"`
	Args     []string      `toml:"args"`
	WorkDir  string        `toml:"work_dir"`
	StopWait time.Duration `toml:"stop_wait"`
}

type Docker struct {
	Container string `toml:"container"`
	Host      string `toml:"host"`
}

type File struct {
	Path string `toml:"path"`
}

type Saves struct {
	Remote   string        `toml:"remote"`
	Password string        `toml:"password"`
	Key      string        `toml:"key"`
	HostKey  string        `toml:"host_key"`
	Timeout  time.Duration `toml:"timeout"`
	Reader   string        `toml:"reader"`
	Path     string        `toml:"path"`
	Interval time.Duration `toml:"interval"`
}

type Mod struct {
	Events string `toml:"events"`
	Stop   string `toml:"stop"`
}

type Intervals struct {
	Metrics   time.Duration `toml:"metrics"`
	Heartbeat time.Duration `toml:"heartbeat"`
	Flush     time.Duration `toml:"flush"`
	Actions   time.Duration `toml:"actions"`
}

type Config struct {
	Site        Site        `toml:"site"`
	Dragonwilds Dragonwilds `toml:"dragonwilds"`
	Logs        Logs        `toml:"logs"`
	Launch      Launch      `toml:"launch"`
	Docker      Docker      `toml:"docker"`
	File        File        `toml:"file"`
	Saves       Saves       `toml:"saves"`
	Mod         Mod         `toml:"mod"`
	Intervals   Intervals   `toml:"intervals"`
	JournalDir  string      `toml:"journal_dir"`

	Path      string     `toml:"-"`
	LogPath   string     `toml:"-"`
	SaveDir   string     `toml:"-"`
	ServerIni *ServerIni `toml:"-"`
	Warnings  []string   `toml:"-"`
}

type Options struct {
	Path     string
	Getenv   func(string) string
	ExeDir   string
	DryRun   bool
	Platform string
}

func Load(options Options) (*Config, error) {
	if options.Getenv == nil {
		options.Getenv = os.Getenv
	}
	cfg := &Config{}
	path := options.Path
	explicit := path != ""
	if !explicit && options.ExeDir != "" {
		path = filepath.Join(options.ExeDir, DefaultFileName)
	}
	if path != "" {
		data, err := os.ReadFile(path)
		switch {
		case err == nil:
			meta, decodeErr := toml.Decode(string(data), cfg)
			if decodeErr != nil {
				return nil, fmt.Errorf("%s: %w", path, decodeErr)
			}
			if undecoded := meta.Undecoded(); len(undecoded) > 0 {
				keys := make([]string, 0, len(undecoded))
				for _, key := range undecoded {
					keys = append(keys, key.String())
				}
				return nil, fmt.Errorf("%s: unknown keys: %s", path, strings.Join(keys, ", "))
			}
			cfg.Path = path
		case explicit || !errors.Is(err, fs.ErrNotExist):
			return nil, fmt.Errorf("reading config: %w", err)
		}
	}
	if err := applyEnv(cfg, options.Getenv); err != nil {
		return nil, err
	}
	if cfg.Docker.Host == "" {
		cfg.Docker.Host = options.Getenv("DOCKER_HOST")
	}
	applyDefaults(cfg, options)
	derive(cfg, options.Platform)
	if err := validate(cfg, options.DryRun); err != nil {
		return nil, err
	}
	return cfg, nil
}

func applyDefaults(cfg *Config, options Options) {
	cfg.Logs.Source = strings.ToLower(strings.TrimSpace(cfg.Logs.Source))
	cfg.Site.URL = strings.TrimSpace(cfg.Site.URL)
	if cfg.Dragonwilds.ServerDir == "" && cfg.Launch.Command != "" {
		cfg.Dragonwilds.ServerDir = ServerRoot(cfg.Launch.Command)
	}
	if cfg.Logs.Source == "" {
		switch {
		case cfg.Launch.Command != "":
			cfg.Logs.Source = SourceLaunch
		case cfg.Docker.Container != "":
			cfg.Logs.Source = SourceDocker
		case cfg.Logs.Remote != "":
			cfg.Logs.Source = SourceRemote
		case cfg.File.Path != "" || cfg.Logs.Path != "" || cfg.Dragonwilds.ServerDir != "":
			cfg.Logs.Source = SourceFile
		default:
			cfg.Logs.Source = SourceNone
		}
	}
	defaults := []struct {
		target *time.Duration
		value  time.Duration
	}{
		{&cfg.Intervals.Metrics, 30 * time.Second},
		{&cfg.Intervals.Heartbeat, 60 * time.Second},
		{&cfg.Intervals.Flush, 2 * time.Second},
		{&cfg.Intervals.Actions, 5 * time.Second},
		{&cfg.Launch.StopWait, 90 * time.Second},
		{&cfg.Saves.Interval, 30 * time.Second},
		{&cfg.Logs.Interval, 5 * time.Second},
		{&cfg.Logs.Timeout, 30 * time.Second},
		{&cfg.Saves.Timeout, 30 * time.Second},
	}
	for _, entry := range defaults {
		if *entry.target == 0 {
			*entry.target = entry.value
		}
	}
	if cfg.JournalDir == "" {
		base := options.ExeDir
		if cfg.Path != "" {
			base = filepath.Dir(cfg.Path)
		}
		if base == "" {
			base = "."
		}
		cfg.JournalDir = filepath.Join(base, "magpie-journal")
	}
	if cfg.Saves.Reader == "" && options.ExeDir != "" {
		cfg.Saves.Reader = findSaveReader(options.ExeDir, options.Platform)
	}
}

func findSaveReader(dir, platform string) string {
	goos := platform
	if goos == "" {
		goos = runtime.GOOS
	}
	suffix := ""
	if goos == "windows" {
		suffix = ".exe"
	}
	for _, name := range []string{"magpie-savereader" + suffix, "magpie-savereader-" + goos + "-" + runtime.GOARCH + suffix} {
		candidate := filepath.Join(dir, name)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	return ""
}

func ServerRoot(executable string) string {
	if executable == "" {
		return ""
	}
	dir := filepath.Dir(executable)
	for range 5 {
		if info, err := os.Stat(filepath.Join(dir, "RSDragonwilds", "Binaries")); err == nil && info.IsDir() {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

func SavedDir(serverDir string) string {
	return filepath.Join(serverDir, "RSDragonwilds", "Saved")
}

func derive(cfg *Config, platform string) {
	if cfg.Dragonwilds.ServerDir != "" {
		saved := SavedDir(cfg.Dragonwilds.ServerDir)
		cfg.SaveDir = filepath.Join(saved, "SaveGames")
		ini, err := FindServerIni(cfg.Dragonwilds.ServerDir, platform)
		if err != nil {
			cfg.Warnings = append(cfg.Warnings, err.Error())
		} else {
			cfg.ServerIni = ini
		}
	}
	switch cfg.Logs.Source {
	case SourceFile:
		cfg.LogPath = firstOf(cfg.File.Path, cfg.Logs.Path)
	case SourceLaunch:
		cfg.LogPath = cfg.Logs.Path
	}
	if cfg.LogPath == "" && cfg.Dragonwilds.ServerDir != "" && (cfg.Logs.Source == SourceFile || cfg.Logs.Source == SourceLaunch) {
		cfg.LogPath = filepath.Join(SavedDir(cfg.Dragonwilds.ServerDir), "Logs", LogFileName)
	}
	if cfg.Saves.Path != "" {
		cfg.SaveDir = filepath.Dir(cfg.Saves.Path)
	}
	if cfg.Saves.Reader != "" {
		if _, err := os.Stat(cfg.Saves.Reader); err != nil {
			cfg.Warnings = append(cfg.Warnings, fmt.Sprintf("saves.reader %s: %v; the world save is not read", cfg.Saves.Reader, err))
			cfg.Saves.Reader = ""
		} else if cfg.SaveDir == "" && cfg.Saves.Remote == "" {
			cfg.Warnings = append(cfg.Warnings, "the save reader is here but the world save folder is unknown; set dragonwilds.server_dir or saves.path so the collector can read it")
		}
	}
	if cfg.Mod.Stop == "" && cfg.Logs.Source == SourceLaunch {
		cfg.Warnings = append(cfg.Warnings, "no mod.stop file is set, so stopping the server cannot save the world first; load the events mod and set mod.stop to the file it watches")
	}
}

func firstOf(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func validate(cfg *Config, dryRun bool) error {
	var problems []string
	if !dryRun {
		if cfg.Site.URL == "" {
			problems = append(problems, "site.url is required")
		} else if parsed, err := url.Parse(cfg.Site.URL); err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			problems = append(problems, fmt.Sprintf("site.url %q must be an http or https URL", cfg.Site.URL))
		}
		if cfg.Site.Secret == "" {
			problems = append(problems, "site.secret is required")
		}
	}
	switch cfg.Logs.Source {
	case SourceLaunch:
		if cfg.Launch.Command == "" {
			problems = append(problems, "logs.source is launch but launch.command is empty")
		}
		if cfg.LogPath == "" {
			problems = append(problems, "logs.source is launch but the server log path is unknown; set dragonwilds.server_dir or logs.path")
		}
	case SourceDocker:
		if cfg.Docker.Container == "" {
			problems = append(problems, "logs.source is docker but docker.container is empty")
		}
	case SourceFile:
		if cfg.LogPath == "" {
			problems = append(problems, "logs.source is file but no log path is known; set file.path, logs.path or dragonwilds.server_dir")
		}
	case SourceRemote:
		if cfg.Logs.Remote == "" {
			problems = append(problems, "logs.source is remote but logs.remote is empty")
		}
	case SourceStdin, SourceNone:
	default:
		problems = append(problems, fmt.Sprintf("logs.source %q must be launch, docker, file, remote, stdin or none", cfg.Logs.Source))
	}
	if cfg.Logs.Source == SourceNone && cfg.Saves.Reader == "" && cfg.Mod.Events == "" {
		problems = append(problems, "the collector has nothing to read; set a log source, a save reader or mod.events")
	}
	intervals := []struct {
		name  string
		value time.Duration
	}{
		{"intervals.metrics", cfg.Intervals.Metrics},
		{"intervals.heartbeat", cfg.Intervals.Heartbeat},
		{"intervals.flush", cfg.Intervals.Flush},
		{"intervals.actions", cfg.Intervals.Actions},
		{"launch.stop_wait", cfg.Launch.StopWait},
		{"saves.interval", cfg.Saves.Interval},
		{"logs.interval", cfg.Logs.Interval},
		{"logs.timeout", cfg.Logs.Timeout},
		{"saves.timeout", cfg.Saves.Timeout},
	}
	for _, interval := range intervals {
		if interval.value < time.Second {
			problems = append(problems, fmt.Sprintf("%s must be at least 1s (use a duration string such as \"5s\")", interval.name))
		}
	}
	if cfg.Saves.Interval < 10*time.Second {
		problems = append(problems, "saves.interval must be at least 10s; the save reader reads the whole world")
	}
	if cfg.Intervals.Heartbeat > 150*time.Second {
		problems = append(problems, "intervals.heartbeat must be at most 150s; the site declares a collector lost after 180s without a batch")
	}
	if cfg.Logs.Interval > 60*time.Second {
		problems = append(problems, "logs.interval must be at most 60s")
	}
	if cfg.Logs.Remote != "" && cfg.Logs.Source != SourceRemote {
		problems = append(problems, "logs.remote requires logs.source remote")
	}
	if cfg.Saves.Remote != "" && cfg.Saves.Path != "" {
		problems = append(problems, "choose either saves.remote or saves.path")
	}
	for label, options := range map[string]remote.Options{"logs": cfg.LogRemote(), "saves": cfg.SaveRemote()} {
		if options.URL != "" {
			if _, err := remote.New(options); err != nil {
				problems = append(problems, label+": "+err.Error())
			}
		}
	}
	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	return nil
}

func (cfg *Config) LogRemote() remote.Options {
	return remote.Options{URL: cfg.Logs.Remote, Password: cfg.Logs.Password, KeyFile: cfg.Logs.Key, HostKey: cfg.Logs.HostKey, Timeout: cfg.Logs.Timeout}
}
func (cfg *Config) SaveRemote() remote.Options {
	return remote.Options{URL: cfg.Saves.Remote, Password: cfg.Saves.Password, KeyFile: cfg.Saves.Key, HostKey: cfg.Saves.HostKey, Timeout: cfg.Saves.Timeout}
}

func (cfg *Config) IngestURL() string {
	trimmed := strings.TrimRight(cfg.Site.URL, "/")
	if strings.HasSuffix(trimmed, "/api/ingest") {
		return trimmed
	}
	return trimmed + "/api/ingest"
}

func (cfg *Config) ServerName() string {
	if cfg.ServerIni != nil && cfg.ServerIni.ServerName != "" {
		return cfg.ServerIni.ServerName
	}
	return ""
}

func (cfg *Config) WorldName() string {
	if cfg.ServerIni != nil {
		return cfg.ServerIni.DefaultWorldName
	}
	return ""
}

type envSetter struct {
	name  string
	apply func(cfg *Config, value string) error
}

func stringSetter(name string, target func(cfg *Config) *string) envSetter {
	return envSetter{name, func(cfg *Config, value string) error {
		*target(cfg) = value
		return nil
	}}
}

func durationSetter(name string, target func(cfg *Config) *time.Duration) envSetter {
	return envSetter{name, func(cfg *Config, value string) error {
		parsed, err := time.ParseDuration(value)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		*target(cfg) = parsed
		return nil
	}}
}

var envSetters = []envSetter{
	stringSetter("MAGPIE_LOGS_REMOTE", func(c *Config) *string { return &c.Logs.Remote }),
	stringSetter("MAGPIE_LOGS_PASSWORD", func(c *Config) *string { return &c.Logs.Password }),
	stringSetter("MAGPIE_LOGS_KEY", func(c *Config) *string { return &c.Logs.Key }),
	stringSetter("MAGPIE_LOGS_HOST_KEY", func(c *Config) *string { return &c.Logs.HostKey }),
	durationSetter("MAGPIE_LOGS_INTERVAL", func(c *Config) *time.Duration { return &c.Logs.Interval }),
	durationSetter("MAGPIE_LOGS_TIMEOUT", func(c *Config) *time.Duration { return &c.Logs.Timeout }),
	stringSetter("MAGPIE_SAVES_REMOTE", func(c *Config) *string { return &c.Saves.Remote }),
	stringSetter("MAGPIE_SAVES_PASSWORD", func(c *Config) *string { return &c.Saves.Password }),
	stringSetter("MAGPIE_SAVES_KEY", func(c *Config) *string { return &c.Saves.Key }),
	stringSetter("MAGPIE_SAVES_HOST_KEY", func(c *Config) *string { return &c.Saves.HostKey }),
	durationSetter("MAGPIE_SAVES_TIMEOUT", func(c *Config) *time.Duration { return &c.Saves.Timeout }),
	stringSetter("MAGPIE_SITE_URL", func(c *Config) *string { return &c.Site.URL }),
	stringSetter("MAGPIE_SITE_SECRET", func(c *Config) *string { return &c.Site.Secret }),
	stringSetter("MAGPIE_SERVER_DIR", func(c *Config) *string { return &c.Dragonwilds.ServerDir }),
	stringSetter("MAGPIE_LOGS_SOURCE", func(c *Config) *string { return &c.Logs.Source }),
	stringSetter("MAGPIE_LOGS_PATH", func(c *Config) *string { return &c.Logs.Path }),
	stringSetter("MAGPIE_LAUNCH_COMMAND", func(c *Config) *string { return &c.Launch.Command }),
	{"MAGPIE_LAUNCH_ARGS", func(c *Config, value string) error {
		args, err := SplitArgs(value)
		if err != nil {
			return fmt.Errorf("MAGPIE_LAUNCH_ARGS: %w", err)
		}
		c.Launch.Args = args
		return nil
	}},
	stringSetter("MAGPIE_LAUNCH_WORK_DIR", func(c *Config) *string { return &c.Launch.WorkDir }),
	durationSetter("MAGPIE_LAUNCH_STOP_WAIT", func(c *Config) *time.Duration { return &c.Launch.StopWait }),
	stringSetter("MAGPIE_DOCKER_CONTAINER", func(c *Config) *string { return &c.Docker.Container }),
	stringSetter("MAGPIE_DOCKER_HOST", func(c *Config) *string { return &c.Docker.Host }),
	stringSetter("MAGPIE_FILE_PATH", func(c *Config) *string { return &c.File.Path }),
	stringSetter("MAGPIE_SAVES_READER", func(c *Config) *string { return &c.Saves.Reader }),
	stringSetter("MAGPIE_SAVES_PATH", func(c *Config) *string { return &c.Saves.Path }),
	durationSetter("MAGPIE_SAVES_INTERVAL", func(c *Config) *time.Duration { return &c.Saves.Interval }),
	stringSetter("MAGPIE_MOD_EVENTS", func(c *Config) *string { return &c.Mod.Events }),
	stringSetter("MAGPIE_MOD_STOP", func(c *Config) *string { return &c.Mod.Stop }),
	durationSetter("MAGPIE_INTERVALS_METRICS", func(c *Config) *time.Duration { return &c.Intervals.Metrics }),
	durationSetter("MAGPIE_INTERVALS_HEARTBEAT", func(c *Config) *time.Duration { return &c.Intervals.Heartbeat }),
	durationSetter("MAGPIE_INTERVALS_FLUSH", func(c *Config) *time.Duration { return &c.Intervals.Flush }),
	durationSetter("MAGPIE_INTERVALS_ACTIONS", func(c *Config) *time.Duration { return &c.Intervals.Actions }),
	stringSetter("MAGPIE_JOURNAL_DIR", func(c *Config) *string { return &c.JournalDir }),
}

func applyEnv(cfg *Config, getenv func(string) string) error {
	for _, setter := range envSetters {
		value := getenv(setter.name)
		if value == "" {
			continue
		}
		if err := setter.apply(cfg, value); err != nil {
			return err
		}
	}
	return nil
}

func SplitArgs(value string) ([]string, error) {
	trimmed := strings.TrimSpace(value)
	if strings.HasPrefix(trimmed, "[") {
		var args []string
		if err := json.Unmarshal([]byte(trimmed), &args); err != nil {
			return nil, err
		}
		return args, nil
	}
	var args []string
	var current strings.Builder
	inQuotes := false
	hasToken := false
	for _, r := range trimmed {
		switch {
		case r == '"':
			inQuotes = !inQuotes
			hasToken = true
		case (r == ' ' || r == '\t') && !inQuotes:
			if hasToken {
				args = append(args, current.String())
				current.Reset()
				hasToken = false
			}
		default:
			current.WriteRune(r)
			hasToken = true
		}
	}
	if inQuotes {
		return nil, errors.New("unterminated quote")
	}
	if hasToken {
		args = append(args, current.String())
	}
	return args, nil
}

func Itoa(value int) string {
	return strconv.Itoa(value)
}
