package dragonwilds

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/serverlog"
)

const TypeWorldLoaded = "world.loaded"

const (
	respawnWindow  = 30 * time.Second
	otherPerMinute = 30
	maxMessage     = 2000
)

type Emission struct {
	Type   string
	At     time.Time
	Player *event.EventPlayer
	Data   any
}

type WorldLoaded struct {
	GUID string
	Name string
	Slot string
}

type ServerState struct {
	Build      string
	WorldName  string
	Slot       string
	WorldGUID  string
	MaxPlayers int
	Online     bool
	Exiting    bool
}

type presence struct {
	event.Identity
	online bool
}

type login struct {
	userID   string
	platform string
}

type death struct {
	at time.Time
}

var (
	loginLine    = regexp.MustCompile(`^Login request: (\S*)\s+userId: (\S+) platform: (\S+)$`)
	enteredLine  = regexp.MustCompile(`^PlayerChar entered world \[Account\[XP:([^\]]*)\] Character Name\[([^\]]*)\] Guid\[DCG:([0-9A-Fa-f]{32})\]`)
	leaveLine    = regexp.MustCompile(`^ClientRequestDisconnect : DisconnectMe : PlayerStateSave result\[(true|false)\] - state saved for Account\[XP:([^\]]*)\] Character Name\[([^\]]*)\] Guid\[DCG:([0-9A-Fa-f]{32})\]`)
	removedLine  = regexp.MustCompile(`^Player Removed from session \[([^\]]*)\]-\[([^\]]*)\]$`)
	journalLine  = regexp.MustCompile(`UnlockJournalEntriesByPredicate\(\) : Unlocking Journal Entry "([^"]+)"`)
	saveStart    = regexp.MustCompile(`SaveGame\(\) : Starting save \(Guid\[([0-9A-Fa-f]{32})\] WorldName\[([^\]]*)\] SlotName\[([^\]]*)\]`)
	saveResult   = regexp.MustCompile(`^Save to slot (.+?): (.+)$`)
	loadingLine  = regexp.MustCompile(`^Loading configured world \[([^\]]*)\] from save slot \[([^\]]*)\]$`)
	creatingLine = regexp.MustCompile(`^No save found for configured world \[([^\]]*)\]; creating it`)
	loadedLine   = regexp.MustCompile(`PostLoadWorldState\(\) : World load SUCCEEDED \(slot: ([^)]*)\) \(Guid\[([0-9A-Fa-f]{32})\] WorldName\[([^\]]*)\]`)
	maxLine      = regexp.MustCompile(`^Maximum allowed player number by this build is (\d+)\.?$`)
	buildLine    = regexp.MustCompile(`^Build: (\S+)$`)
	graveLine    = regexp.MustCompile(`^SpawnActor failed to find teleport spot \[X=([-0-9.]+) Y=([-0-9.]+) Z=([-0-9.]+)\] for \[BP_PlayerGravestone_C\]`)
	teleportLine = regexp.MustCompile(`TeleportTo\(\) : \[([^\]]+)\] Teleporting to V\(X=([-0-9.]+), Y=([-0-9.]+), Z=([-0-9.]+)\)`)
	teleportedOK = regexp.MustCompile(`TeleportSucceeded\(\) : \[([^\]]+)\] Teleport Succeeded!`)
	kickStart    = regexp.MustCompile(`^Attempting to Kick player \[([^\]]*)\]$`)
	kickDone     = regexp.MustCompile(`^AUTH: Successfully kicked player (.+)$`)
	preLogin     = regexp.MustCompile(`^PreLogin failure: (.+)$`)
	exitLine     = regexp.MustCompile(`^Engine exit requested`)
	hexOnly      = regexp.MustCompile(`^[0-9a-fA-F]{32}$`)
)

var quietErrors = map[string]bool{
	"LogHoudiniEngineRuntime": true,
}

type Mapper struct {
	players   map[string]*presence
	names     map[string]string
	logins    map[string]login
	teleports map[string][3]float64
	deaths    []death
	server    ServerState
	minute    time.Time
	others    int
}

func NewMapper() *Mapper {
	return &Mapper{
		players:   map[string]*presence{},
		names:     map[string]string{},
		logins:    map[string]login{},
		teleports: map[string][3]float64{},
	}
}

func (m *Mapper) Server() ServerState {
	return m.server
}

func (m *Mapper) Reset() {
	m.players = map[string]*presence{}
	m.names = map[string]string{}
	m.logins = map[string]login{}
	m.teleports = map[string][3]float64{}
	m.deaths = nil
	m.server.Online = false
	m.server.Exiting = false
	m.server.WorldGUID = ""
}

func (m *Mapper) Online() []event.Identity {
	var out []event.Identity
	for _, player := range m.players {
		if player.online {
			out = append(out, player.Identity)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func (m *Mapper) Identify(name string) (event.Identity, bool) {
	userID, ok := m.names[name]
	if !ok {
		return event.Identity{Name: name}, false
	}
	player, ok := m.players[userID]
	if !ok {
		return event.Identity{Name: name}, false
	}
	return player.Identity, true
}

func (m *Mapper) single() (event.Identity, bool) {
	online := m.Online()
	if len(online) != 1 {
		return event.Identity{}, false
	}
	return online[0], true
}

func (m *Mapper) remember(id event.Identity) *presence {
	key := strings.ToLower(id.UserID)
	player, ok := m.players[key]
	if !ok {
		player = &presence{}
		m.players[key] = player
	}
	if id.CharacterGUID != "" {
		player.CharacterGUID = strings.ToUpper(id.CharacterGUID)
	}
	if id.Name != "" {
		player.Name = id.Name
		m.names[id.Name] = key
	}
	if id.Platform != "" {
		player.Platform = id.Platform
	}
	player.UserID = id.UserID
	return player
}

func loginOptions(options string) map[string]string {
	out := map[string]string{}
	for _, part := range strings.Split(options, "?") {
		if part == "" {
			continue
		}
		key, value, _ := strings.Cut(part, "=")
		out[strings.ToLower(key)] = value
	}
	return out
}

func userIDOf(raw string) string {
	raw = strings.TrimSpace(raw)
	if _, id, found := strings.Cut(raw, ":"); found {
		raw = id
	}
	return strings.ToLower(raw)
}

func (m *Mapper) Map(record serverlog.Record, at time.Time) []Emission {
	message := strings.TrimPrefix(record.Message, "[DedicatedServer] ")
	switch record.Category {
	case "LogInit":
		if match := buildLine.FindStringSubmatch(message); match != nil {
			m.server.Build = match[1]
		}
	case "LogDomMatcherSession":
		if match := maxLine.FindStringSubmatch(message); match != nil {
			m.server.MaxPlayers, _ = strconv.Atoi(match[1])
		} else if match := removedLine.FindStringSubmatch(message); match != nil {
			return m.removed(match[1], match[2], at)
		}
	case "LogDomServerGameMode":
		if match := loadingLine.FindStringSubmatch(message); match != nil {
			m.server.WorldName, m.server.Slot = match[1], match[2]
		} else if match := creatingLine.FindStringSubmatch(message); match != nil {
			m.server.WorldName, m.server.Slot = match[1], match[1]
		}
	case "LogPersistence":
		if match := loadedLine.FindStringSubmatch(message); match != nil {
			return m.loaded(match[2], match[3], match[1], at)
		}
		if match := saveStart.FindStringSubmatch(message); match != nil && !m.server.Online {
			return m.loaded(match[1], match[2], match[3], at)
		}
	case "LogSpudSubsystem":
		if match := saveResult.FindStringSubmatch(message); match != nil {
			return []Emission{{event.TypeServerSaved, at, nil, event.ServerSavedData{Slot: event.String(match[1]), OK: strings.EqualFold(match[2], "Success")}}}
		}
	case "LogNet":
		if match := loginLine.FindStringSubmatch(message); match != nil {
			options := loginOptions(match[1])
			if name := options["name"]; name != "" {
				m.logins[name] = login{userID: userIDOf(match[2]), platform: strings.ToLower(options["pf"])}
			}
		} else if match := preLogin.FindStringSubmatch(message); match != nil {
			return m.other(record.Category, "Warning", "PreLogin failure: "+match[1], at)
		}
	case "LogDominionPlayerControllerBase":
		if match := enteredLine.FindStringSubmatch(message); match != nil {
			return m.entered(match[1], match[2], match[3], at)
		}
	case "LogDominionPlayerController":
		if match := leaveLine.FindStringSubmatch(message); match != nil {
			saved := match[1] == "true"
			return m.left(match[2], match[3], match[4], &saved, at)
		}
	case "LogJournal":
		if match := journalLine.FindStringSubmatch(message); match != nil {
			data := event.JournalUnlockedData{Entry: match[1]}
			var player *event.EventPlayer
			if id, ok := m.single(); ok {
				data.UserID = event.String(id.UserID)
				data.CharacterGUID = event.String(id.CharacterGUID)
				data.Name = event.String(id.Name)
				player = id.Player()
			}
			return []Emission{{event.TypeJournalUnlocked, at, player, data}}
		}
	case "LogSpawn":
		if match := graveLine.FindStringSubmatch(message); match != nil {
			return m.died(match[1], match[2], match[3], at)
		}
	case "LogDominionPlayerCharacter":
		if match := teleportLine.FindStringSubmatch(message); match != nil {
			m.teleports[match[1]] = [3]float64{number(match[2]), number(match[3]), number(match[4])}
		} else if match := teleportedOK.FindStringSubmatch(message); match != nil {
			return m.respawned(match[1], at)
		}
	case "LogCore":
		if exitLine.MatchString(message) {
			m.server.Exiting = true
		}
	}
	if match := kickStart.FindStringSubmatch(message); match != nil {
		return nil
	}
	if match := kickDone.FindStringSubmatch(message); match != nil {
		return m.kicked(strings.TrimSpace(match[1]), at)
	}
	if record.Level == "Error" && !quietErrors[record.Category] {
		return m.other(record.Category, record.Level, message, at)
	}
	return nil
}

func number(value string) float64 {
	parsed, _ := strconv.ParseFloat(value, 64)
	return parsed
}

func (m *Mapper) loaded(guid, name, slot string, at time.Time) []Emission {
	m.server.WorldGUID = strings.ToUpper(guid)
	if name != "" {
		m.server.WorldName = name
	}
	if slot != "" {
		m.server.Slot = slot
	}
	m.server.Online = true
	m.server.Exiting = false
	return []Emission{{TypeWorldLoaded, at, nil, WorldLoaded{GUID: m.server.WorldGUID, Name: m.server.WorldName, Slot: m.server.Slot}}}
}

func (m *Mapper) entered(userID, name, guid string, at time.Time) []Emission {
	id := event.Identity{UserID: strings.ToLower(userID), CharacterGUID: strings.ToUpper(guid), Name: name}
	if pending, ok := m.logins[name]; ok {
		id.Platform = pending.platform
		if id.UserID == "" {
			id.UserID = pending.userID
		}
		delete(m.logins, name)
	}
	if id.UserID == "" {
		return nil
	}
	player := m.remember(id)
	if player.online {
		return nil
	}
	player.online = true
	return []Emission{{event.TypePlayerJoined, at, player.Player(), event.PlayerJoinedData{
		UserID:        player.UserID,
		CharacterGUID: event.String(player.CharacterGUID),
		Name:          player.Name,
		Platform:      event.String(player.Platform),
		Source:        event.SourceLog,
	}}}
}

func (m *Mapper) left(userID, name, guid string, saved *bool, at time.Time) []Emission {
	id := event.Identity{UserID: strings.ToLower(userID), CharacterGUID: guid, Name: name}
	if id.UserID == "" {
		if known, ok := m.names[name]; ok {
			id.UserID = known
		} else {
			return nil
		}
	}
	player := m.remember(id)
	if !player.online {
		return nil
	}
	player.online = false
	return []Emission{{event.TypePlayerLeft, at, player.Player(), event.PlayerLeftData{
		UserID:        player.UserID,
		CharacterGUID: event.String(player.CharacterGUID),
		Name:          player.Name,
		Saved:         saved,
		Source:        event.SourceLog,
	}}}
}

func (m *Mapper) removed(userID, name string, at time.Time) []Emission {
	return m.left(userID, name, "", nil, at)
}

func (m *Mapper) died(x, y, z string, at time.Time) []Emission {
	id, ok := m.single()
	if !ok {
		return nil
	}
	m.deaths = append(m.deaths, death{at: at})
	if len(m.deaths) > 8 {
		m.deaths = m.deaths[len(m.deaths)-8:]
	}
	return []Emission{{event.TypePlayerDied, at, id.Player(), event.PlayerDiedData{
		UserID:        event.String(id.UserID),
		CharacterGUID: event.String(id.CharacterGUID),
		Name:          id.Name,
		X:             event.Float(number(x)),
		Y:             event.Float(number(y)),
		Z:             event.Float(number(z)),
		Source:        event.SourceLog,
	}}}
}

func (m *Mapper) respawned(actor string, at time.Time) []Emission {
	position, known := m.teleports[actor]
	delete(m.teleports, actor)
	recent := false
	kept := m.deaths[:0]
	for _, entry := range m.deaths {
		if at.Sub(entry.at) <= respawnWindow && !recent {
			recent = true
			continue
		}
		kept = append(kept, entry)
	}
	m.deaths = kept
	if !recent {
		return nil
	}
	id, ok := m.single()
	if !ok {
		return nil
	}
	data := event.PlayerRespawnedData{UserID: event.String(id.UserID), CharacterGUID: event.String(id.CharacterGUID), Name: id.Name}
	if known {
		data.X, data.Y, data.Z = event.Float(position[0]), event.Float(position[1]), event.Float(position[2])
	}
	return []Emission{{event.TypePlayerRespawned, at, id.Player(), data}}
}

func (m *Mapper) kicked(target string, at time.Time) []Emission {
	data := event.PlayerKickedData{}
	var player *event.EventPlayer
	if hexOnly.MatchString(target) {
		data.UserID = event.String(strings.ToLower(target))
		if known, ok := m.players[strings.ToLower(target)]; ok {
			data.Name = event.String(known.Name)
			data.CharacterGUID = event.String(known.CharacterGUID)
			player = known.Player()
		}
	} else {
		data.Name = event.String(target)
		if id, ok := m.Identify(target); ok {
			data.UserID = event.String(id.UserID)
			data.CharacterGUID = event.String(id.CharacterGUID)
			player = id.Player()
		}
	}
	return []Emission{{event.TypePlayerKicked, at, player, data}}
}

func (m *Mapper) other(category, level, message string, at time.Time) []Emission {
	minute := at.Truncate(time.Minute)
	if !minute.Equal(m.minute) {
		m.minute = minute
		m.others = 0
	}
	m.others++
	if m.others > otherPerMinute {
		return nil
	}
	text := Line(message)
	if len(text) > maxMessage {
		text = text[:maxMessage]
	}
	return []Emission{{event.TypeLogOther, at, nil, event.LogOtherData{Category: category, Level: event.String(level), Message: text}}}
}
