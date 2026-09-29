package event

import "time"

const (
	TypeCollectorStarted   = "collector.started"
	TypeCollectorHeartbeat = "collector.heartbeat"
	TypeServerOnline       = "server.online"
	TypeServerStopping     = "server.stopping"
	TypeServerOffline      = "server.offline"
	TypeServerSaved        = "server.saved"
	TypeServerMetrics      = "server.metrics"
	TypePlayerJoined       = "player.joined"
	TypePlayerLeft         = "player.left"
	TypePlayerDied         = "player.died"
	TypePlayerRespawned    = "player.respawned"
	TypeJournalUnlocked    = "journal.unlocked"
	TypeSaveWorld          = "save.world"
	TypeSavePlayer         = "save.player"
	TypeSaveRead           = "save.read"
	TypeLogOther           = "log.other"
	TypeChatMessage        = "chat.message"
	TypePlayerEvent        = "player.event"
	TypePlayerXp           = "player.xp"
	TypeSkillLevelUp       = "skill.level_up"
	TypeQuestUpdated       = "quest.updated"
	TypeBuildingPlaced     = "building.placed"
	TypeItemCrafted        = "item.crafted"
	TypeAdminAction        = "admin.action"
	TypePlayerKicked       = "player.kicked"
	TypeActionCompleted    = "action.completed"
	TypeActionFailed       = "action.failed"
)

const (
	SourceLog = "log"
	SourceMod = "mod"
)

const (
	OfflineStopped           = "stopped"
	OfflineCrashed           = "crashed"
	OfflineUnreachable       = "unreachable"
	OfflineCollectorStopping = "collector_stopping"
)

const (
	SaveRequested = "requested"
	SaveDone      = "done"
	SaveFailed    = "failed"
)

type EventPlayer struct {
	Name     string  `json:"name"`
	Platform *string `json:"platform"`
}

type Identity struct {
	UserID        string
	CharacterGUID string
	Name          string
	Platform      string
}

func (id Identity) Player() *EventPlayer {
	if id.Name == "" {
		return nil
	}
	return &EventPlayer{Name: id.Name, Platform: String(id.Platform)}
}

type ServerInfo struct {
	Name       string  `json:"name"`
	Version    *string `json:"version"`
	Build      *string `json:"build"`
	WorldName  string  `json:"world_name"`
	WorldGUID  *string `json:"world_guid"`
	MaxPlayers *int    `json:"max_players"`
}

type ServerSettings struct {
	MaxPlayers       *int    `json:"max_players"`
	PlatformPolicy   *string `json:"platform_policy"`
	SaveFrequencyMin *int    `json:"save_frequency_min"`
}

type CollectorLayers struct {
	Logs       bool    `json:"logs"`
	LogsSource *string `json:"logs_source"`
	Saves      bool    `json:"saves"`
	Process    bool    `json:"process"`
	Mod        bool    `json:"mod"`
}

type CollectorStartedData struct {
	CollectorVersion string          `json:"collector_version"`
	OS               string          `json:"os"`
	Arch             string          `json:"arch"`
	Layers           CollectorLayers `json:"layers"`
	Server           *ServerInfo     `json:"server"`
	Settings         *ServerSettings `json:"settings"`
}

type CollectorHeartbeatData struct {
	UptimeS       float64 `json:"uptime_s"`
	QueueDepth    int     `json:"queue_depth"`
	DroppedEvents int64   `json:"dropped_events"`
	Logs          string  `json:"logs"`
	Saves         string  `json:"saves"`
	Process       string  `json:"process"`
	Mod           string  `json:"mod"`
}

type ServerOnlineData struct {
	ServerInfo
	Settings *ServerSettings `json:"settings"`
}

type ServerStoppingData struct {
	By   *string `json:"by"`
	Save *string `json:"save"`
}

type ServerOfflineData struct {
	Reason string `json:"reason"`
}

type ServerSavedData struct {
	Slot *string `json:"slot"`
	OK   bool    `json:"ok"`
}

type ServerMetricsData struct {
	MemoryMB   float64  `json:"memory_mb"`
	UptimeS    float64  `json:"uptime_s"`
	Players    int      `json:"players"`
	MaxPlayers *int     `json:"max_players"`
	CPUPercent *float64 `json:"cpu_percent"`
}

type PlayerJoinedData struct {
	UserID        string  `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          string  `json:"name"`
	Platform      *string `json:"platform"`
	Source        string  `json:"source"`
}

type PlayerLeftData struct {
	UserID        string  `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          string  `json:"name"`
	Saved         *bool   `json:"saved"`
	Source        string  `json:"source"`
}

type PlayerDiedData struct {
	UserID        *string        `json:"user_id"`
	CharacterGUID *string        `json:"character_guid"`
	Name          string         `json:"name"`
	X             *float64       `json:"x"`
	Y             *float64       `json:"y"`
	Z             *float64       `json:"z"`
	Source        string         `json:"source"`
	Cause         *string        `json:"cause"`
	Killer        *string        `json:"killer"`
	Params        map[string]any `json:"params,omitempty"`
}

type PlayerRespawnedData struct {
	UserID        *string  `json:"user_id"`
	CharacterGUID *string  `json:"character_guid"`
	Name          string   `json:"name"`
	X             *float64 `json:"x"`
	Y             *float64 `json:"y"`
	Z             *float64 `json:"z"`
}

type JournalUnlockedData struct {
	UserID        *string `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          *string `json:"name"`
	Entry         string  `json:"entry"`
}

type PlayerHealth struct {
	Current float64 `json:"current"`
	Max     float64 `json:"max"`
}

type SaveSkill struct {
	ID string  `json:"id"`
	XP float64 `json:"xp"`
}

type SaveQuest struct {
	ID        string  `json:"id"`
	State     string  `json:"state"`
	Objective *string `json:"objective"`
}

type SavePlayerData struct {
	SavedAt         time.Time     `json:"saved_at"`
	CharacterGUID   string        `json:"character_guid"`
	UserID          *string       `json:"user_id"`
	Name            string        `json:"name"`
	PlaytimeS       *float64      `json:"playtime_s"`
	Health          *PlayerHealth `json:"health"`
	Skills          []SaveSkill   `json:"skills"`
	Quests          []SaveQuest   `json:"quests"`
	JournalUnlocked *int          `json:"journal_unlocked"`
	JournalUnread   *int          `json:"journal_unread"`
	Spells          *int          `json:"spells"`
	RegionsRevealed *int          `json:"regions_revealed"`
	HealthCurrent   *float64      `json:"health_current,omitempty"`
	StaminaCurrent  *float64      `json:"stamina_current,omitempty"`
}

type SaveReadData struct {
	SavedAt        time.Time `json:"saved_at"`
	WorldGUID      string    `json:"world_guid"`
	CharacterGUIDs []string  `json:"character_guids"`
}

type SaveWeather struct {
	Region     string   `json:"region"`
	Type       string   `json:"type"`
	DayCount   *int     `json:"day_count"`
	RemainingS *float64 `json:"remaining_s"`
}

type SaveWorldTrigger struct {
	ID    string  `json:"id"`
	Name  *string `json:"name"`
	State *string `json:"state"`
}

type SaveWorldData struct {
	SavedAt            time.Time          `json:"saved_at"`
	WorldGUID          string             `json:"world_guid"`
	WorldName          *string            `json:"world_name"`
	Day                *int               `json:"day"`
	TimeOfDay          *float64           `json:"time_of_day"`
	Weather            []SaveWeather      `json:"weather"`
	Events             []SaveWorldTrigger `json:"events"`
	Hardcore           *bool              `json:"hardcore"`
	FriendlyFire       *bool              `json:"friendly_fire"`
	Difficulty         *string            `json:"difficulty"`
	SizeBytes          *int64             `json:"size_bytes"`
	LastSavedBy        *string            `json:"last_saved_by"`
	HardcoreState      *int               `json:"hardcore_state,omitempty"`
	SurvivalDifficulty *int               `json:"survival_difficulty,omitempty"`
}

type LogOtherData struct {
	Category string  `json:"category"`
	Level    *string `json:"level"`
	Message  string  `json:"message"`
}

type ChatMessageData struct {
	UserID        *string `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          string  `json:"name"`
	Channel       string  `json:"channel"`
	Text          string  `json:"text"`
	Recipients    *int    `json:"recipients"`
}

type PlayerEventData struct {
	UserID        *string `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          string  `json:"name"`
	Tag           string  `json:"tag"`
}

type PlayerXpData struct {
	UserID        *string  `json:"user_id"`
	CharacterGUID *string  `json:"character_guid"`
	Name          string   `json:"name"`
	Skill         string   `json:"skill"`
	XP            float64  `json:"xp"`
	Delta         *float64 `json:"delta"`
}

type SkillLevelUpData struct {
	UserID        *string `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          string  `json:"name"`
	Skill         string  `json:"skill"`
	Level         int     `json:"level"`
}

type QuestUpdatedData struct {
	UserID        *string `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          string  `json:"name"`
	Quest         string  `json:"quest"`
	State         string  `json:"state"`
	Objective     *string `json:"objective"`
}

type BuildingPlacedData struct {
	UserID        *string `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          string  `json:"name"`
	Building      string  `json:"building"`
}

type ItemCraftedData struct {
	UserID        *string `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          string  `json:"name"`
	Recipe        string  `json:"recipe"`
	Count         *int    `json:"count"`
}

type AdminActionData struct {
	UserID        *string `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          string  `json:"name"`
	Action        string  `json:"action"`
	Target        *string `json:"target"`
}

type PlayerKickedData struct {
	UserID        *string `json:"user_id"`
	CharacterGUID *string `json:"character_guid"`
	Name          *string `json:"name"`
	By            *string `json:"by"`
	Reason        *string `json:"reason"`
}

type ActionCompletedData struct {
	ActionID int64  `json:"action_id"`
	Kind     string `json:"kind"`
}

type ActionFailedData struct {
	ActionID int64  `json:"action_id"`
	Kind     string `json:"kind"`
	Error    string `json:"error"`
}

func String(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func Float(value float64) *float64 {
	return &value
}

func Int(value int) *int {
	return &value
}

func Bool(value bool) *bool {
	return &value
}
