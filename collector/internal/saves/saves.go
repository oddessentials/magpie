package saves

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/oddessentials/magpie/collector/internal/event"
)

const (
	Format      = 1
	maxOutput   = 64 << 20
	maxStderr   = 4 << 10
	ReadTimeout = 2 * time.Minute
)

type Result struct {
	SavedAt    time.Time
	World      event.SaveWorldData
	Characters []event.SavePlayerData
	Progress   []event.SaveProgressData
	GUIDs      []string
}

type output struct {
	ClockSeconds *float64 `json:"clock_seconds"`
	Discoveries  []struct {
		CharacterGUID string   `json:"character_guid"`
		POIs          []string `json:"pois"`
	} `json:"discoveries"`
	Progress  *event.SavedWorldProgress `json:"progress"`
	Buildings []struct {
		DataID     string `json:"data_id"`
		Unfinished bool   `json:"unfinished"`
	} `json:"buildings"`
	Format  int       `json:"format"`
	SavedAt time.Time `json:"saved_at"`
	World   struct {
		GUID               string `json:"guid"`
		Name               string `json:"name"`
		FriendlyFire       *bool  `json:"friendly_fire"`
		SurvivalDifficulty *int   `json:"survival_difficulty"`
		HardcoreState      *int   `json:"hardcore_state"`
		LastSavedBy        string `json:"last_saved_by"`
	} `json:"world"`
	Weather []struct {
		Region        string  `json:"region"`
		Type          string  `json:"type"`
		DayCount      int     `json:"day_count"`
		RemainingTime float64 `json:"remaining_time"`
	} `json:"weather"`
	Events []struct {
		Name     string `json:"name"`
		Triggers []struct {
			Name  string `json:"name"`
			Value any    `json:"value"`
		} `json:"triggers"`
	} `json:"events"`
	Characters []struct {
		GUID           string             `json:"guid"`
		Intact         bool               `json:"intact"`
		Name           string             `json:"name"`
		WorldsPlaytime map[string]float64 `json:"worlds_playtime"`
		Health         float64            `json:"health"`
		Stamina        float64            `json:"stamina"`
		Skills         []struct {
			ID string  `json:"id"`
			XP float64 `json:"xp"`
		} `json:"skills"`
		Quests []struct {
			ID        string `json:"id"`
			State     int    `json:"state"`
			Objective string `json:"objective"`
		} `json:"quests"`
		Journal struct {
			Unlocked int `json:"unlocked"`
			Unread   int `json:"unread"`
		} `json:"journal"`
		SpellsSelected int                       `json:"spells_selected"`
		Position       *event.SavePosition       `json:"position"`
		Inventory      []event.SaveSlot          `json:"inventory"`
		Loadout        []event.SaveSlot          `json:"loadout"`
		Unlocks        *unlocks                  `json:"unlocks"`
		JournalEntries []string                  `json:"journal_entries"`
		QuestLocations []event.SaveQuestLocation `json:"quest_locations"`
	} `json:"characters"`
}

type unlocks struct {
	Recipes          []string `json:"recipes"`
	Buildings        []string `json:"buildings"`
	ItemsPickedUp    []string `json:"items_picked_up"`
	ActorsInteracted []string `json:"actors_interacted"`
	CreaturesKilled  []string `json:"creatures_killed"`
}

func Locate(dir, world string) (string, bool) {
	if dir == "" {
		return "", false
	}
	if world != "" {
		candidate := filepath.Join(dir, world+".sav")
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, true
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", false
	}
	var newest string
	var newestTime time.Time
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".sav") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if newest == "" || info.ModTime().After(newestTime) {
			newest = filepath.Join(dir, entry.Name())
			newestTime = info.ModTime()
		}
	}
	return newest, newest != ""
}

func Modified(path string) (time.Time, int64, error) {
	info, err := os.Stat(path)
	if err != nil {
		return time.Time{}, 0, err
	}
	return info.ModTime(), info.Size(), nil
}

type limited struct {
	bytes.Buffer
	limit    int
	overflow bool
}

func (l *limited) Write(p []byte) (int, error) {
	if l.Len()+len(p) > l.limit {
		l.overflow = true
		p = p[:max(0, l.limit-l.Len())]
	}
	l.Buffer.Write(p)
	return len(p), nil
}

func Read(ctx context.Context, reader, path string) (*Result, error) {
	ctx, cancel := context.WithTimeout(ctx, ReadTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, reader, "read", path)
	stdout := &limited{limit: maxOutput}
	stderr := &limited{limit: maxStderr}
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		if message := strings.TrimSpace(stderr.String()); message != "" {
			return nil, fmt.Errorf("%w: %s", err, message)
		}
		return nil, err
	}
	if stdout.overflow {
		return nil, fmt.Errorf("the save reader printed more than %d MB", maxOutput>>20)
	}
	size := int64(0)
	if info, err := os.Stat(path); err == nil {
		size = info.Size()
	}
	return Decode(stdout.Bytes(), size)
}

func Decode(raw []byte, size int64) (*Result, error) {
	var out output
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("reading the save reader's output: %w", err)
	}
	if out.Format != Format {
		return nil, fmt.Errorf("the save reader writes format %d and this collector reads format %d; use matching versions", out.Format, Format)
	}
	if out.SavedAt.IsZero() {
		return nil, errors.New("the save reader did not say when the save was written")
	}
	if out.World.GUID == "" {
		return nil, errors.New("the save reader did not report the world guid")
	}
	if out.ClockSeconds != nil && *out.ClockSeconds < 0 {
		return nil, errors.New("the save reader reported a negative clock")
	}
	savedAt := out.SavedAt.UTC()
	guid := strings.ToUpper(out.World.GUID)
	result := &Result{SavedAt: savedAt}
	result.World = event.SaveWorldData{
		ClockSeconds: out.ClockSeconds,
		SavedAt:      savedAt,
		WorldGUID:    guid,
		WorldName:    event.String(out.World.Name),
		Weather:      []event.SaveWeather{},
		Events:       []event.SaveWorldTrigger{},
		FriendlyFire: out.World.FriendlyFire,
		LastSavedBy:  event.String(out.World.LastSavedBy),
	}
	if size > 0 {
		result.World.SizeBytes = &size
	}
	result.World.HardcoreState = out.World.HardcoreState
	result.World.Progress = out.Progress
	if out.Discoveries != nil {
		counts := map[string]map[string]bool{}
		result.World.Discoveries = []event.SavedDiscovery{}
		for _, entry := range out.Discoveries {
			if entry.CharacterGUID == "" {
				return nil, errors.New("discovery has no saved character")
			}
			for _, id := range entry.POIs {
				if id == "" {
					return nil, errors.New("discovery has no POI identifier")
				}
				if counts[id] == nil {
					counts[id] = map[string]bool{}
				}
				counts[id][entry.CharacterGUID] = true
			}
		}
		for id, characters := range counts {
			result.World.Discoveries = append(result.World.Discoveries, event.SavedDiscovery{ID: id, Characters: len(characters)})
		}
		sort.Slice(result.World.Discoveries, func(i, j int) bool { return result.World.Discoveries[i].ID < result.World.Discoveries[j].ID })
	}
	if out.Buildings != nil {
		buildings := &event.SavedBuildings{Total: len(out.Buildings), Types: []event.SavedBuildingCount{}}
		counts := map[string]int{}
		for _, piece := range out.Buildings {
			counts[piece.DataID]++
			if piece.Unfinished {
				buildings.Unfinished++
			}
		}
		for id, count := range counts {
			buildings.Types = append(buildings.Types, event.SavedBuildingCount{ID: id, Count: count})
		}
		sort.Slice(buildings.Types, func(i, j int) bool { return buildings.Types[i].ID < buildings.Types[j].ID })
		result.World.Buildings = buildings
	}
	result.World.SurvivalDifficulty = out.World.SurvivalDifficulty
	for _, weather := range out.Weather {
		result.World.Weather = append(result.World.Weather, event.SaveWeather{
			Region:     weather.Region,
			Type:       strings.TrimPrefix(weather.Type, "EWeatherType::"),
			DayCount:   event.Int(weather.DayCount),
			RemainingS: event.Float(weather.RemainingTime),
		})
	}
	for _, entry := range out.Events {
		var active []string
		for _, trigger := range entry.Triggers {
			if value, ok := trigger.Value.(bool); ok && value {
				active = append(active, trigger.Name)
			}
		}
		sort.Strings(active)
		result.World.Events = append(result.World.Events, event.SaveWorldTrigger{ID: entry.Name, State: event.String(strings.Join(active, ","))})
	}
	for _, character := range out.Characters {
		characterGUID := strings.ToUpper(character.GUID)
		if characterGUID == "" {
			continue
		}
		result.GUIDs = append(result.GUIDs, characterGUID)
		if !character.Intact || character.Name == "" {
			continue
		}
		player := event.SavePlayerData{
			SavedAt:         savedAt,
			CharacterGUID:   characterGUID,
			Name:            character.Name,
			HealthCurrent:   event.Float(character.Health),
			StaminaCurrent:  event.Float(character.Stamina),
			Skills:          []event.SaveSkill{},
			Quests:          []event.SaveQuest{},
			JournalUnlocked: event.Int(character.Journal.Unlocked),
			JournalUnread:   event.Int(character.Journal.Unread),
			Spells:          event.Int(character.SpellsSelected),
		}
		if playtime, ok := character.WorldsPlaytime[guid]; ok {
			player.PlaytimeS = event.Float(playtime)
		} else {
			for key, playtime := range character.WorldsPlaytime {
				if strings.EqualFold(key, guid) {
					player.PlaytimeS = event.Float(playtime)
				}
			}
		}
		for _, skill := range character.Skills {
			player.Skills = append(player.Skills, event.SaveSkill{ID: skill.ID, XP: skill.XP})
		}
		for _, quest := range character.Quests {
			state := event.QuestState(float64(quest.State))
			if state == "" {
				state = strconv.Itoa(quest.State)
			}
			player.Quests = append(player.Quests, event.SaveQuest{ID: quest.ID, State: state, Objective: event.String(quest.Objective)})
		}
		player.Inventory = character.Inventory
		player.Loadout = character.Loadout
		player.Position = character.Position
		result.Characters = append(result.Characters, player)
		if character.Unlocks != nil || character.JournalEntries != nil || character.QuestLocations != nil {
			progress := event.SaveProgressData{SavedAt: savedAt, CharacterGUID: characterGUID, Name: character.Name, Journal: character.JournalEntries, QuestLocations: character.QuestLocations}
			if found := character.Unlocks; found != nil {
				progress.Recipes, progress.Buildings, progress.ItemsPickedUp, progress.ActorsInteracted, progress.CreaturesKilled = found.Recipes, found.Buildings, found.ItemsPickedUp, found.ActorsInteracted, found.CreaturesKilled
			}
			result.Progress = append(result.Progress, progress)
		}
	}
	sort.Strings(result.GUIDs)
	return result, nil
}

type Emission struct {
	Type string
	Data any
}

type Tracker struct {
	seen map[string]string
}

func NewTracker() *Tracker {
	return &Tracker{seen: map[string]string{}}
}

func fingerprint(value any) string {
	encoded, _ := json.Marshal(value)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func (t *Tracker) changed(key string, value any) bool {
	sum := fingerprint(value)
	if t.seen[key] == sum {
		return false
	}
	t.seen[key] = sum
	return true
}

func (t *Tracker) Changes(result *Result) []Emission {
	out := []Emission{{event.TypeSaveWorld, result.World}}
	present := map[string]bool{}
	for _, player := range result.Characters {
		key := "player:" + player.CharacterGUID
		present[key] = true
		comparable := player
		comparable.SavedAt = time.Time{}
		if t.changed(key, comparable) {
			out = append(out, Emission{event.TypeSavePlayer, player})
		}
	}
	for _, progress := range result.Progress {
		key := "progress:" + progress.CharacterGUID
		present[key] = true
		comparable := progress
		comparable.SavedAt = time.Time{}
		if t.changed(key, comparable) {
			out = append(out, Emission{event.TypeSaveProgress, progress})
		}
	}
	for key := range t.seen {
		if !present[key] {
			delete(t.seen, key)
		}
	}
	guids := result.GUIDs
	if guids == nil {
		guids = []string{}
	}
	out = append(out, Emission{event.TypeSaveRead, event.SaveReadData{SavedAt: result.SavedAt, WorldGUID: result.World.WorldGUID, CharacterGUIDs: guids}})
	return out
}
