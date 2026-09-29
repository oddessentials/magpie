package collector

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/oddessentials/magpie/collector/internal/buildinfo"
	"github.com/oddessentials/magpie/collector/internal/config"
	"github.com/oddessentials/magpie/collector/internal/dragonwilds"
	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/ingest"
	"github.com/oddessentials/magpie/collector/internal/remote"
	"github.com/oddessentials/magpie/collector/internal/saves"
	"github.com/oddessentials/magpie/collector/internal/serverlog"
)

const (
	CollectorName  = "magpie-collector"
	logIdleAfter   = 2 * time.Minute
	maxPreStart    = 20000
	saveCheckEvery = 10 * time.Second
	killWait       = 15 * time.Second
)

const (
	stateOff         = "off"
	stateOK          = "ok"
	stateWaiting     = "waiting"
	stateError       = "error"
	stateIdle        = "idle"
	stateUnavailable = "unavailable"
)

type Options struct {
	ReadSave     func(context.Context, string, string) (*saves.Result, error)
	Config       *config.Config
	Logger       *slog.Logger
	Stdout       io.Writer
	Stdin        io.Reader
	DryRun       io.Writer
	Source       serverlog.Source
	Process      serverlog.Process
	IngestHTTP   *http.Client
	StartupWait  time.Duration
	StopFlush    time.Duration
	OfflineAfter time.Duration
	SaveDebounce time.Duration
}

type sourceState struct {
	state serverlog.State
	err   error
}

type sink struct {
	lines  chan serverlog.Line
	states chan sourceState
	done   <-chan struct{}
}

func (s *sink) Line(line serverlog.Line) {
	select {
	case s.lines <- line:
	case <-s.done:
	}
}

func (s *sink) State(state serverlog.State, err error) {
	select {
	case s.states <- sourceState{state, err}:
	case <-s.done:
	}
}

type processExit struct {
	code int
	err  error
}

type emission struct {
	Type   string
	At     time.Time
	Player *event.EventPlayer
	Data   any
}

type Collector struct {
	options   Options
	cfg       *config.Config
	log       *slog.Logger
	factory   *event.Factory
	journal   *ingest.Journal
	pipe      *ingest.Pipeline
	mapper    *dragonwilds.Mapper
	actionLog *ActionLog
	startedAt time.Time

	server         atomic.Pointer[event.ServerInfo]
	expectShutdown atomic.Bool

	source   serverlog.Source
	process  serverlog.Process
	launched bool

	loopCtx       context.Context
	lines         chan serverlog.Line
	states        chan sourceState
	modLines      chan serverlog.Line
	modStates     chan sourceState
	saveResults   chan saveOutcome
	actionResults chan actionResult
	processDone   chan processExit

	startedEmitted  bool
	startupDeadline time.Time
	preStart        []emission

	serverUp    bool
	settings    *event.ServerSettings
	logState    serverlog.State
	lastLogLine time.Time
	clockWarned bool

	modState  serverlog.State
	modWarned bool

	saveTracker       *saves.Tracker
	saveRunning       bool
	saveState         string
	saveProblem       string
	savePath          string
	saveModified      time.Time
	saveSize          int64
	saveChangedAt     time.Time
	saveReadAt        time.Time
	saveDirWarned     bool
	remoteSave        *remote.Client
	remoteSaveAttempt time.Time
	remoteSaveChecked time.Time
	remoteLogChecked  time.Time

	processState string
	stopMu       sync.Mutex
	stopping     bool
	stopBy       string
	stopSave     string
	stopDeadline time.Time
	stopSignaled bool
	killed       bool
	exitErr      error
	forced       bool
}

func New(options Options) (*Collector, error) {
	cfg := options.Config
	if options.Logger == nil {
		options.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if options.StopFlush <= 0 {
		options.StopFlush = 10 * time.Second
	}
	if options.OfflineAfter <= 0 {
		options.OfflineAfter = 3 * time.Minute
	}
	if options.SaveDebounce <= 0 {
		options.SaveDebounce = 10 * time.Second
	}
	if options.StartupWait <= 0 {
		options.StartupWait = 15 * time.Second
		if cfg.Logs.Source == config.SourceLaunch {
			options.StartupWait = 120 * time.Second
		}
	}
	journal, replay, err := ingest.OpenJournal(cfg.JournalDir)
	if err != nil {
		return nil, fmt.Errorf("opening the journal in %s: %w", cfg.JournalDir, err)
	}
	actionLog, err := OpenActionLog(cfg.JournalDir)
	if err != nil {
		journal.Close()
		return nil, fmt.Errorf("opening the action log: %w", err)
	}
	c := &Collector{
		options:       options,
		cfg:           cfg,
		log:           options.Logger,
		factory:       event.NewFactory(event.NewUUID()),
		journal:       journal,
		mapper:        dragonwilds.NewMapper(),
		actionLog:     actionLog,
		lines:         make(chan serverlog.Line, 4096),
		states:        make(chan sourceState, 64),
		modLines:      make(chan serverlog.Line, 1024),
		modStates:     make(chan sourceState, 16),
		saveResults:   make(chan saveOutcome, 1),
		actionResults: make(chan actionResult, 64),
		processDone:   make(chan processExit, 1),
		logState:      serverlog.StateConnecting,
		saveTracker:   saves.NewTracker(),
		saveState:     stateOff,
		processState:  stateOff,
	}
	if c.savesEnabled() {
		c.saveState = stateWaiting
	}
	c.settings = settingsFrom(cfg)
	c.pipe = ingest.NewPipeline(ingest.Options{
		URL:           cfg.IngestURL(),
		Secret:        cfg.Site.Secret,
		FlushInterval: cfg.Intervals.Flush,
		ActionPoll:    cfg.Intervals.Actions,
		UserAgent:     CollectorName + "/" + buildinfo.Version,
		DryRun:        options.DryRun,
		Client:        options.IngestHTTP,
	}, journal, replay, c.envelope, options.Logger)
	return c, nil
}

func settingsFrom(cfg *config.Config) *event.ServerSettings {
	if cfg.ServerIni == nil {
		return nil
	}
	return &event.ServerSettings{
		PlatformPolicy:   event.String(cfg.ServerIni.PlatformPolicy),
		SaveFrequencyMin: cfg.ServerIni.SaveFrequencyMin,
	}
}

func (c *Collector) RunID() string {
	return c.factory.RunID()
}

func (c *Collector) envelope() (ingest.CollectorInfo, any) {
	info := ingest.CollectorInfo{
		Name:    CollectorName,
		Version: buildinfo.Version,
		RunID:   c.factory.RunID(),
		OS:      runtime.GOOS,
		Arch:    runtime.GOARCH,
	}
	if server := c.server.Load(); server != nil {
		return info, *server
	}
	return info, nil
}

func (c *Collector) modEnv() []string {
	var env []string
	if c.cfg.Mod.Events != "" {
		env = append(env, "MAGPIE_EVENTS_FILE="+c.cfg.Mod.Events)
	}
	if c.cfg.Mod.Stop != "" {
		env = append(env, "MAGPIE_STOP_FILE="+c.cfg.Mod.Stop)
	}
	return env
}

func (c *Collector) setupSource() error {
	if c.cfg.Saves.Remote != "" {
		client, err := remote.New(c.cfg.SaveRemote())
		if err != nil {
			return err
		}
		c.remoteSave = client
	}
	switch {
	case c.options.Source != nil:
		c.source = c.options.Source
		if c.options.Process != nil {
			c.process = c.options.Process
			c.launched = true
		}
	case c.cfg.Logs.Source == config.SourceLaunch:
		if c.cfg.Mod.Stop != "" {
			os.Remove(c.cfg.Mod.Stop)
		}
		if c.cfg.LogPath != "" {
			os.Rename(c.cfg.LogPath, c.cfg.LogPath+".previous")
		}
		args, added := serverlog.WithLaunchFlags(c.cfg.Launch.Args)
		if len(added) > 0 {
			c.log.Info("added launch flags the collector needs", "flags", strings.Join(added, " "))
		}
		spec, resolved := serverlog.ResolveLaunch(serverlog.LaunchSpec{Command: c.cfg.Launch.Command, Args: args, Dir: c.cfg.Launch.WorkDir, Env: c.modEnv(), Output: c.options.Stdout})
		if resolved {
			c.log.Info("starting the server binary directly, because the launcher only waits for it", "command", spec.Command)
		}
		process, err := serverlog.StartProcess(spec)
		if err != nil {
			return fmt.Errorf("starting the server: %w", err)
		}
		c.process = process
		c.launched = true
		c.source = &serverlog.FileSource{Path: c.cfg.LogPath, FromStart: true}
		c.log.Info("started the server", "pid", process.Pid(), "command", spec.Command)
	case c.cfg.Logs.Source == config.SourceDocker:
		c.source = &serverlog.DockerSource{
			Host:       c.cfg.Docker.Host,
			Container:  c.cfg.Docker.Container,
			CursorPath: filepath.Join(c.journal.Dir(), "docker.cursor"),
		}
	case c.cfg.Logs.Source == config.SourceFile:
		c.source = &serverlog.FileSource{Path: c.cfg.LogPath, CursorPath: filepath.Join(c.journal.Dir(), "file.cursor")}
	case c.cfg.Logs.Source == config.SourceRemote:
		client, err := remote.New(c.cfg.LogRemote())
		if err != nil {
			return err
		}
		c.source = &serverlog.RemoteSource{File: client, CursorPath: filepath.Join(c.journal.Dir(), "remote.cursor"), Poll: c.cfg.Logs.Interval}
	case c.cfg.Logs.Source == config.SourceStdin:
		c.source = &serverlog.StdinSource{Reader: c.options.Stdin, Mirror: c.options.Stdout}
	}
	if c.launched {
		c.processState = stateUnavailable
		c.writePid()
		process := c.process
		go func() {
			code, err := process.Wait()
			c.processDone <- processExit{code: code, err: err}
		}()
	}
	return nil
}

func (c *Collector) Run(ctx context.Context, force <-chan struct{}) error {
	c.startedAt = time.Now()
	loopCtx, loopCancel := context.WithCancel(context.Background())
	defer loopCancel()
	c.loopCtx = loopCtx
	if err := c.setupSource(); err != nil {
		c.journal.Close()
		return err
	}
	pipeCtx, pipeCancel := context.WithCancel(context.Background())
	var workers sync.WaitGroup
	workers.Add(1)
	go func() {
		defer workers.Done()
		c.pipe.Run(pipeCtx)
	}()
	actionCtx, actionCancel := context.WithCancel(context.Background())
	workers.Add(1)
	go func() {
		defer workers.Done()
		runActions(actionCtx, c.actionLog, c.pipe.Actions(), c.actionResults)
	}()
	sourceCtx, sourceCancel := context.WithCancel(context.Background())
	sourceDone := make(chan struct{})
	if c.source != nil {
		go func() {
			defer close(sourceDone)
			c.source.Run(sourceCtx, &sink{lines: c.lines, states: c.states, done: loopCtx.Done()})
		}()
	} else {
		close(sourceDone)
		c.logState = serverlog.StateDown
	}
	modCtx, modCancel := context.WithCancel(context.Background())
	if c.modEnabled() {
		workers.Add(1)
		go func() {
			defer workers.Done()
			c.runMod(modCtx, loopCtx.Done())
		}()
	}
	site := c.cfg.IngestURL()
	if c.options.DryRun != nil {
		site = "dry run, batches go to stdout"
	}
	c.log.Info("collector running",
		"version", buildinfo.Version,
		"run_id", c.factory.RunID(),
		"logs", c.cfg.Logs.Source,
		"saves", c.savesEnabled(),
		"mod", c.modEnabled(),
		"site", site,
		"journal", c.cfg.JournalDir)
	c.startupDeadline = time.Now().Add(c.options.StartupWait)
	c.checkSaves()
	c.loop(ctx, force)
	modCancel()
	sourceCancel()
	actionCancel()
	flushCtx, flushCancel := context.WithTimeout(context.Background(), c.options.StopFlush)
	if !c.pipe.Flush(flushCtx) {
		c.log.Warn("some events were not delivered before exit; they stay in the journal and are sent on the next start", "pending", c.pipe.Stats().Depth)
	}
	flushCancel()
	pipeCancel()
	loopCancel()
	select {
	case <-sourceDone:
	case <-time.After(3 * time.Second):
	}
	workers.Wait()
	c.journal.Close()
	c.removePid()
	if c.process != nil {
		c.process.Close()
	}
	if c.launched && c.exitErr != nil {
		return c.exitErr
	}
	return nil
}

func (c *Collector) loop(ctx context.Context, force <-chan struct{}) {
	intervals := c.cfg.Intervals
	metrics := time.NewTicker(intervals.Metrics)
	heartbeat := time.NewTicker(intervals.Heartbeat)
	housekeeping := time.NewTicker(500 * time.Millisecond)
	savePoll := saveCheckEvery
	if c.remoteSave != nil {
		savePoll = c.cfg.Saves.Interval
	}
	saveTicker := time.NewTicker(savePoll)
	defer metrics.Stop()
	defer heartbeat.Stop()
	defer housekeeping.Stop()
	defer saveTicker.Stop()
	signals := ctx.Done()
	for {
		select {
		case <-signals:
			signals = nil
			if !c.beginStop() {
				return
			}
		case <-force:
			c.forceStop()
		case <-metrics.C:
			c.emitMetrics()
		case <-heartbeat.C:
			c.emitHeartbeat()
		case <-housekeeping.C:
			if c.housekeeping() {
				return
			}
		case line := <-c.lines:
			c.onLine(line)
		case state := <-c.states:
			if c.onSourceState(state) {
				c.drainLines()
				c.finishOutput()
				return
			}
		case exit := <-c.processDone:
			c.drainLines()
			c.finishProcess(exit)
			return
		case result := <-c.actionResults:
			c.onActionResult(result)
		case <-saveTicker.C:
			c.checkSaves()
		case outcome := <-c.saveResults:
			c.onSaveResult(outcome)
		case line := <-c.modLines:
			c.onModLine(line)
		case state := <-c.modStates:
			c.onModState(state)
		}
	}
}

func (c *Collector) drainLines() {
	for {
		select {
		case line := <-c.lines:
			c.onLine(line)
		case line := <-c.modLines:
			c.onModLine(line)
		default:
			return
		}
	}
}

func (c *Collector) housekeeping() bool {
	now := time.Now()
	if !c.startedEmitted && (c.serverUp || now.After(c.startupDeadline)) {
		c.ensureStarted()
	}
	if c.serverUp && !c.launched && c.cfg.Logs.Source != config.SourceNone && !c.lastLogLine.IsZero() && now.Sub(c.lastLogLine) > c.options.OfflineAfter {
		c.markOffline(event.OfflineUnreachable)
	}
	c.stopMu.Lock()
	stopping, deadline, killed := c.stopping, c.stopDeadline, c.killed
	c.stopMu.Unlock()
	if stopping && !deadline.IsZero() && now.After(deadline) {
		if !killed {
			c.log.Warn("the server did not stop in time; terminating it")
			c.kill()
			c.stopMu.Lock()
			c.stopDeadline = now.Add(killWait)
			c.stopMu.Unlock()
		} else {
			c.log.Error("the server process did not exit after being terminated")
			c.ensureStarted()
			c.markOffline(event.OfflineStopped)
			return true
		}
	}
	return false
}

func (c *Collector) ensureStarted() {
	if c.startedEmitted {
		return
	}
	c.startedEmitted = true
	var source *string
	if c.cfg.Logs.Source != config.SourceNone {
		source = event.String(c.cfg.Logs.Source)
	}
	c.enqueue(event.TypeCollectorStarted, c.startedAt, nil, event.CollectorStartedData{
		CollectorVersion: buildinfo.Version,
		OS:               runtime.GOOS,
		Arch:             runtime.GOARCH,
		Layers: event.CollectorLayers{
			Remote:     c.remoteObservation(),
			Logs:       c.cfg.Logs.Source != config.SourceNone,
			LogsSource: source,
			Saves:      c.savesEnabled(),
			Process:    c.launched,
			Mod:        c.modEnabled(),
		},
		Server:   c.server.Load(),
		Settings: c.settings,
	})
	pending := c.preStart
	c.preStart = nil
	for _, item := range pending {
		c.enqueue(item.Type, item.At, item.Player, item.Data)
	}
	for _, entry := range c.actionLog.Interrupted() {
		c.enqueue(event.TypeActionFailed, time.Now(), nil, event.ActionFailedData{
			ActionID: entry.ID,
			Kind:     entry.Kind,
			Error:    "the collector restarted before the outcome was known",
		})
		c.actionLog.Record(entry.ID, entry.Kind, actionFinished)
	}
	c.pipe.Wake()
}

func (c *Collector) emit(eventType string, at time.Time, player *event.EventPlayer, data any) {
	if !c.startedEmitted {
		if len(c.preStart) >= maxPreStart {
			c.preStart = c.preStart[1:]
		}
		c.preStart = append(c.preStart, emission{eventType, at, player, data})
		return
	}
	c.enqueue(eventType, at, player, data)
}

func (c *Collector) enqueue(eventType string, at time.Time, player *event.EventPlayer, data any) {
	created, err := c.factory.NewFor(eventType, at, player, data)
	if err != nil {
		c.log.Error("building an event failed", "type", eventType, "error", err)
		return
	}
	raw, err := created.Marshal()
	if err != nil {
		c.log.Error("encoding an event failed", "type", eventType, "error", err)
		return
	}
	if err := c.pipe.Enqueue(raw); err != nil {
		c.log.Error("queueing an event failed", "type", eventType, "error", err)
	}
}

func (c *Collector) serverInfo(loaded dragonwilds.WorldLoaded) event.ServerInfo {
	state := c.mapper.Server()
	name := c.cfg.ServerName()
	if name == "" {
		name = loaded.Name
	}
	worldName := loaded.Name
	if worldName == "" {
		worldName = c.cfg.WorldName()
	}
	info := event.ServerInfo{
		Name:      name,
		Build:     event.String(state.Build),
		WorldName: worldName,
		WorldGUID: event.String(loaded.GUID),
	}
	if state.MaxPlayers > 0 {
		info.MaxPlayers = event.Int(state.MaxPlayers)
		if c.settings == nil {
			c.settings = &event.ServerSettings{}
		}
		c.settings.MaxPlayers = info.MaxPlayers
	}
	return info
}

func (c *Collector) markOnline(loaded dragonwilds.WorldLoaded, at time.Time) {
	info := c.serverInfo(loaded)
	if c.serverUp {
		if current := c.server.Load(); current != nil && current.WorldGUID != nil && info.WorldGUID != nil && *current.WorldGUID != *info.WorldGUID {
			c.log.Info("the server switched worlds", "world", loaded.Name)
			c.markOffline(event.OfflineStopped)
		} else {
			c.server.Store(&info)
			return
		}
	}
	c.serverUp = true
	c.server.Store(&info)
	c.expectShutdown.Store(false)
	c.log.Info("server online", "name", info.Name, "world", info.WorldName)
	c.emit(event.TypeServerOnline, at, nil, event.ServerOnlineData{ServerInfo: info, Settings: c.settings})
	c.checkSaves()
}

func (c *Collector) markOffline(reason string) {
	c.markOfflineAt(reason, time.Now())
}

func (c *Collector) markOfflineAt(reason string, at time.Time) {
	wasUp := c.serverUp
	c.serverUp = false
	c.mapper.Reset()
	if !c.launched {
		c.expectShutdown.Store(false)
		c.stopMu.Lock()
		c.stopSignaled = false
		c.stopBy = ""
		c.stopSave = ""
		c.stopMu.Unlock()
	}
	if !wasUp {
		return
	}
	c.log.Info("server offline", "reason", reason)
	c.emit(event.TypeServerOffline, at, nil, event.ServerOfflineData{Reason: reason})
}

func (c *Collector) emitMetrics() {
	if !c.launched || c.process == nil {
		return
	}
	memory, ok := c.process.MemoryBytes()
	if !ok {
		c.processState = stateUnavailable
		return
	}
	c.processState = stateOK
	var maxPlayers *int
	if server := c.server.Load(); server != nil {
		maxPlayers = server.MaxPlayers
	}
	c.emit(event.TypeServerMetrics, time.Now(), nil, event.ServerMetricsData{
		MemoryMB:   float64(memory) / (1 << 20),
		UptimeS:    time.Since(c.startedAt).Round(time.Millisecond).Seconds(),
		Players:    len(c.mapper.Online()),
		MaxPlayers: maxPlayers,
	})
}

func (c *Collector) emitHeartbeat() {
	stats := c.pipe.Stats()
	logs := stateOff
	if c.cfg.Logs.Source != config.SourceNone {
		switch c.logState {
		case serverlog.StateConnected:
			logs = stateIdle
			if !c.lastLogLine.IsZero() && time.Since(c.lastLogLine) < logIdleAfter {
				logs = stateOK
			}
		case serverlog.StateConnecting:
			logs = stateIdle
		default:
			logs = stateError
		}
	}
	c.ensureStarted()
	c.emit(event.TypeCollectorHeartbeat, time.Now(), nil, event.CollectorHeartbeatData{
		Remote:        c.remoteObservation(),
		UptimeS:       time.Since(c.startedAt).Round(time.Millisecond).Seconds(),
		QueueDepth:    stats.Depth,
		DroppedEvents: stats.Dropped,
		Logs:          logs,
		Saves:         c.saveState,
		Process:       c.processState,
		Mod:           c.modStateName(),
	})
}
