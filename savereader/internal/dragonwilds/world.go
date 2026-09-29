package dragonwilds

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"strings"
	"time"

	"github.com/oddessentials/magpie/savereader/internal/spud"
)

type World struct {
	ClockSeconds  *float64       `json:"clock_seconds"`
	Discoveries   []Discovery    `json:"discoveries"`
	SavedAt       time.Time      `json:"saved_at"`
	SystemVersion int            `json:"system_version"`
	World         Header         `json:"world"`
	Weather       []Weather      `json:"weather"`
	Events        []Event        `json:"events"`
	Characters    []Character    `json:"characters"`
	Progress      *WorldProgress `json:"progress"`
	Buildings     []Building     `json:"buildings"`
}

type Header struct {
	Version            *int   `json:"version"`
	GUID               string `json:"guid"`
	Name               string `json:"name"`
	Map                string `json:"map"`
	FriendlyFire       *bool  `json:"friendly_fire"`
	SurvivalDifficulty *int   `json:"survival_difficulty"`
	HardcoreState      *int   `json:"hardcore_state"`
	SessionPrivacy     *int   `json:"session_privacy"`
	Crossplay          *bool  `json:"crossplay"`
	OwnerID            string `json:"owner_id"`
	OwnerName          string `json:"owner_name"`
	LastSavedBy        string `json:"last_saved_by"`
	Revision           *int   `json:"revision"`
}

type Weather struct {
	Region        string  `json:"region"`
	Type          string  `json:"type"`
	AltProfile    bool    `json:"alt_profile"`
	DayCount      int     `json:"day_count"`
	RemainingTime float64 `json:"remaining_time"`
}

type Event struct {
	Name     string    `json:"name"`
	Triggers []Trigger `json:"triggers"`
}

type Trigger struct {
	Name  string  `json:"name"`
	Value any     `json:"value"`
	Time  *string `json:"time"`
}

type Character struct {
	GUID           string             `json:"guid"`
	Intact         bool               `json:"intact"`
	Name           string             `json:"name"`
	Type           int                `json:"type"`
	Version        int                `json:"version"`
	SaveCount      int                `json:"save_count"`
	Hardcore       bool               `json:"hardcore"`
	WorldsPlaytime map[string]float64 `json:"worlds_playtime"`
	PlaytimeSim    float64            `json:"playtime_sim"`
	PlaytimeWall   float64            `json:"playtime_wall"`
	Health         float64            `json:"health"`
	Stamina        float64            `json:"stamina"`
	Skills         []Skill            `json:"skills"`
	Quests         []Quest            `json:"quests"`
	Journal        Journal            `json:"journal"`
	SpellsSelected int                `json:"spells_selected"`
	Position       *Position          `json:"position"`
	Inventory      []Slot             `json:"inventory"`
	Loadout        []Slot             `json:"loadout"`
	Unlocks        *Unlocks           `json:"unlocks"`
	JournalEntries []string           `json:"journal_entries"`
	QuestLocations []QuestLocation    `json:"quest_locations"`
}

type Skill struct {
	ID string  `json:"id"`
	XP float64 `json:"xp"`
}

type Quest struct {
	ID        string `json:"id"`
	State     int    `json:"state"`
	Objective string `json:"objective"`
}

type Journal struct {
	Unlocked int `json:"unlocked"`
	Unread   int `json:"unread"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

const (
	classCharacterStates = "CachedCharacterStates"
	classTransforms      = "SavedCharacterTransformsManager"
	classWeather         = "BP_WeatherActor_C"
	classEvents          = "BP_WorldEventManager_C"
	ticksAtUnixEpoch     = 621355968000000000
	ticksPerSecond       = 10000000
)

func ReadFile(path string) (*World, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	world, err := Decode(data)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if info, err := os.Stat(path); err == nil {
		world.SavedAt = info.ModTime().UTC()
	}
	return world, nil
}

func Decode(data []byte) (*World, error) {
	save, err := spud.Parse(data)
	if err != nil {
		return nil, err
	}
	world := &World{
		SystemVersion: int(save.SystemVersion),
		World:         header(save.Info),
		Weather:       []Weather{},
		Events:        []Event{},
		Characters:    []Character{},
	}
	if world.SavedAt, err = savedAt(save); err != nil {
		return nil, err
	}
	for _, object := range objects(save, classWeather) {
		weather, err := decodeWeather(object)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", object.Name, err)
		}
		world.Weather = append(world.Weather, weather...)
	}
	for _, object := range objects(save, classEvents) {
		events, err := decodeEvents(object)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", object.Name, err)
		}
		world.Events = append(world.Events, events...)
	}
	positions := map[string]*Position{}
	for _, object := range objects(save, "BP_InGameTimeActor_C") {
		if world.ClockSeconds, err = decodeClock(object); err != nil {
			return nil, fmt.Errorf("clock: %w", err)
		}
	}
	for _, object := range objects(save, "PoiDiscoverySystemActor") {
		if world.Discoveries, err = decodeDiscoveries(object); err != nil {
			return nil, fmt.Errorf("discoveries: %w", err)
		}
	}
	for _, object := range objects(save, "WorldProgressManager") {
		if world.Progress, err = decodeProgress(object); err != nil {
			return nil, fmt.Errorf("world progress: %w", err)
		}
	}
	for _, object := range objects(save, "GlobalBuildingManager") {
		if world.Buildings, err = decodeBuildings(object); err != nil {
			return nil, fmt.Errorf("buildings: %w", err)
		}
	}
	for _, object := range objects(save, classTransforms) {
		if err := decodePositions(object, positions); err != nil {
			return nil, fmt.Errorf("%s: %w", object.Name, err)
		}
	}
	for _, object := range objects(save, classCharacterStates) {
		characters, err := decodeCharacters(object)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", object.Name, err)
		}
		for i := range characters {
			characters[i].Position = positions[characters[i].GUID]
		}
		world.Characters = append(world.Characters, characters...)
	}
	return world, nil
}

func header(info spud.CustomInfo) Header {
	h := Header{
		Version:            intField(info, "VERSION"),
		FriendlyFire:       boolField(info, "FriendlyFire"),
		SurvivalDifficulty: intField(info, "SurvivalDifficulty"),
		HardcoreState:      intField(info, "HardcoreState"),
		SessionPrivacy:     intField(info, "SessionPrivacy"),
		Revision:           intField(info, "Meta_SaveFileRevision"),
	}
	h.Name, _ = info.String("WorldName")
	h.Map, _ = info.String("WorldMapName")
	h.OwnerID, _ = info.String("WorldOwnerId")
	h.OwnerName, _ = info.String("WorldNameOwner")
	h.LastSavedBy, _ = info.String("LastSavedBy")
	if crossplay := intField(info, "CrossplayEnabled"); crossplay != nil {
		enabled := *crossplay != 0
		h.Crossplay = &enabled
	}
	var guid [16]byte
	complete := true
	for i, name := range []string{"GUID_A", "GUID_B", "GUID_C", "GUID_D"} {
		part, ok := info.Int32(name)
		if !ok {
			complete = false
		}
		binary.LittleEndian.PutUint32(guid[i*4:], uint32(part))
	}
	if complete {
		h.GUID = spud.GUID(guid[:])
	}
	return h
}

func intField(info spud.CustomInfo, name string) *int {
	value, ok := info.Int32(name)
	if !ok {
		return nil
	}
	out := int(value)
	return &out
}

func boolField(info spud.CustomInfo, name string) *bool {
	value, ok := info.Bool(name)
	if !ok {
		return nil
	}
	return &value
}

func savedAt(save *spud.Save) (time.Time, error) {
	if ticks, ok := save.Info.Int64("TimeOfSave"); ok && ticks > ticksAtUnixEpoch {
		since := ticks - ticksAtUnixEpoch
		return time.Unix(since/ticksPerSecond, since%ticksPerSecond*100).UTC(), nil
	}
	stamp, err := time.Parse(time.RFC3339Nano, save.Timestamp)
	if err != nil {
		return time.Time{}, fmt.Errorf("the save carries no usable time: %w", err)
	}
	return stamp.UTC(), nil
}

func objects(save *spud.Save, class string) []*spud.Object {
	var out []*spud.Object
	levels := append([]spud.Level{save.Global}, save.Levels...)
	for l := range levels {
		for i := range levels[l].Objects {
			object := &levels[l].Objects[i]
			if strings.HasSuffix(object.Class, "."+class) {
				out = append(out, object)
			}
		}
	}
	return out
}

func jsonProperty(object *spud.Object, name string, out any) (bool, error) {
	value, ok := object.Property(name)
	if !ok {
		return false, nil
	}
	text, err := value.String()
	if err != nil {
		return false, fmt.Errorf("%s: %w", name, err)
	}
	if err := json.Unmarshal([]byte(text), out); err != nil {
		return false, fmt.Errorf("%s: %w", name, err)
	}
	return true, nil
}

type weatherJSON struct {
	Definitions []struct {
		Name string `json:"WeatherName"`
		Data struct {
			AltProfile    bool    `json:"ALT_PROFILE"`
			Type          string  `json:"TYPE"`
			DayCount      int     `json:"DAY_COUNT"`
			RemainingTime float64 `json:"REMAINING_TIME"`
		} `json:"WeatherData"`
	} `json:"Definitions"`
}

func decodeWeather(object *spud.Object) ([]Weather, error) {
	var doc weatherJSON
	if _, err := jsonProperty(object, "WeathersJSONData", &doc); err != nil {
		return nil, err
	}
	out := make([]Weather, 0, len(doc.Definitions))
	for _, d := range doc.Definitions {
		out = append(out, Weather{Region: d.Name, Type: d.Data.Type, AltProfile: d.Data.AltProfile, DayCount: d.Data.DayCount, RemainingTime: d.Data.RemainingTime})
	}
	return out, nil
}

type eventsJSON struct {
	Definitions []struct {
		Name string `json:"EventName"`
		Data struct {
			Triggers []struct {
				Name string `json:"TriggerName"`
				Data struct {
					Value any     `json:"CurrentValue"`
					Time  *string `json:"TriggerTime"`
				} `json:"TriggerData"`
			} `json:"Triggers"`
		} `json:"EventData"`
	} `json:"Definitions"`
}

func decodeEvents(object *spud.Object) ([]Event, error) {
	var doc eventsJSON
	if _, err := jsonProperty(object, "DefinitionsJSONData", &doc); err != nil {
		return nil, err
	}
	out := make([]Event, 0, len(doc.Definitions))
	for _, d := range doc.Definitions {
		event := Event{Name: d.Name, Triggers: []Trigger{}}
		for _, t := range d.Data.Triggers {
			event.Triggers = append(event.Triggers, Trigger{Name: t.Name, Value: t.Data.Value, Time: t.Data.Time})
		}
		out = append(out, event)
	}
	return out, nil
}

func characterGUID(entry spud.Entry) (string, error) {
	inner, err := entry.Struct("CharacterGuid")
	if err != nil {
		return "", err
	}
	raw, kind, err := inner.Native("InnerGuid")
	if err != nil {
		return "", err
	}
	if kind != "Guid" || len(raw) != 16 {
		return "", fmt.Errorf("InnerGuid is a %s of %d bytes", kind, len(raw))
	}
	return spud.GUID(raw), nil
}

func decodePositions(object *spud.Object, out map[string]*Position) error {
	value, ok := object.Property("SavedCharacterTransforms")
	if !ok {
		return nil
	}
	entries, err := value.Record()
	if err != nil {
		return fmt.Errorf("SavedCharacterTransforms: %w", err)
	}
	for _, entry := range entries {
		guid, err := characterGUID(entry)
		if err != nil {
			return fmt.Errorf("SavedCharacterTransforms: %w", err)
		}
		transform, err := entry.Struct("Transform")
		if err != nil {
			return fmt.Errorf("SavedCharacterTransforms: %w", err)
		}
		raw, kind, err := transform.Native("Translation")
		if err != nil {
			return fmt.Errorf("SavedCharacterTransforms: %w", err)
		}
		if kind != "Vector" || len(raw) != 24 {
			return fmt.Errorf("SavedCharacterTransforms: Translation is a %s of %d bytes", kind, len(raw))
		}
		out[guid] = &Position{
			X: math.Float64frombits(binary.LittleEndian.Uint64(raw[0:])),
			Y: math.Float64frombits(binary.LittleEndian.Uint64(raw[8:])),
			Z: math.Float64frombits(binary.LittleEndian.Uint64(raw[16:])),
		}
	}
	return nil
}

type characterJSON struct {
	Version   int `json:"Version"`
	SaveCount int `json:"SaveCount"`
	Meta      *struct {
		GUID   string             `json:"char_guid"`
		Name   string             `json:"char_name"`
		Type   int                `json:"char_type"`
		Worlds map[string]float64 `json:"worlds_playtime"`
	} `json:"meta_data"`
	Hardcore struct {
		IsHardcore bool `json:"IsHardcore"`
	} `json:"Hardcore"`
	Progress *struct {
		Character struct {
			PlaytimeSim  float64 `json:"Playtime_sim"`
			PlaytimeWall float64 `json:"Playtime_wall"`
			Health       struct {
				CurrentValue float64 `json:"CurrentValue"`
			} `json:"Health"`
			Stamina struct {
				CurrentValue float64 `json:"CurrentValue"`
			} `json:"Stamina"`
		} `json:"Character"`
		Skills struct {
			Skills []struct {
				ID string  `json:"Id"`
				XP float64 `json:"Xp"`
			} `json:"Skills"`
		} `json:"Skills"`
		Quests struct {
			Quests []struct {
				ID        string `json:"QuestId"`
				State     int    `json:"QuestState"`
				Objective string `json:"QuestObjective"`
			} `json:"Quests"`
			Locations json.RawMessage `json:"QuestLocations"`
		} `json:"QuestProgress"`
		Inventory json.RawMessage `json:"Inventory"`
		Loadout   json.RawMessage `json:"Loadout"`
		Unlocks   json.RawMessage `json:"Progress"`
		Journal   struct {
			Unlocked []string `json:"UnlockedEntries"`
			Unread   []string `json:"UnreadEntries"`
		} `json:"Journal"`
		Spellcasting struct {
			Selected []string `json:"SelectedSpells"`
		} `json:"Spellcasting"`
	} `json:"GameProgress"`
}

func decodeCharacters(object *spud.Object) ([]Character, error) {
	value, ok := object.Property("CachedCharacterStates")
	if !ok {
		return nil, nil
	}
	entries, err := value.Record()
	if err != nil {
		return nil, fmt.Errorf("CachedCharacterStates: %w", err)
	}
	out := make([]Character, 0, len(entries))
	for _, entry := range entries {
		guid, err := characterGUID(entry)
		if err != nil {
			return nil, fmt.Errorf("CachedCharacterStates: %w", err)
		}
		character := Character{GUID: guid, WorldsPlaytime: map[string]float64{}, Skills: []Skill{}, Quests: []Quest{}}
		if state, err := entry.String("State"); err == nil {
			character.decode(state)
		}
		out = append(out, character)
	}
	return out, nil
}

func (c *Character) decode(state string) {
	var doc characterJSON
	if err := json.Unmarshal([]byte(state), &doc); err != nil || doc.Meta == nil || doc.Progress == nil {
		return
	}
	c.Intact = true
	c.Name = doc.Meta.Name
	c.Type = doc.Meta.Type
	c.Version = doc.Version
	c.SaveCount = doc.SaveCount
	c.Hardcore = doc.Hardcore.IsHardcore
	if doc.Meta.Worlds != nil {
		c.WorldsPlaytime = doc.Meta.Worlds
	}
	c.PlaytimeSim = doc.Progress.Character.PlaytimeSim
	c.PlaytimeWall = doc.Progress.Character.PlaytimeWall
	c.Health = doc.Progress.Character.Health.CurrentValue
	c.Stamina = doc.Progress.Character.Stamina.CurrentValue
	for _, s := range doc.Progress.Skills.Skills {
		c.Skills = append(c.Skills, Skill{ID: s.ID, XP: s.XP})
	}
	for _, q := range doc.Progress.Quests.Quests {
		c.Quests = append(c.Quests, Quest{ID: q.ID, State: q.State, Objective: q.Objective})
	}
	c.Journal = Journal{Unlocked: len(doc.Progress.Journal.Unlocked), Unread: len(doc.Progress.Journal.Unread)}
	for _, spell := range doc.Progress.Spellcasting.Selected {
		if spell != "" {
			c.SpellsSelected++
		}
	}
	c.Inventory = decodeSlots(doc.Progress.Inventory)
	c.Loadout = decodeSlots(doc.Progress.Loadout)
	c.Unlocks = decodeUnlocks(doc.Progress.Unlocks)
	c.JournalEntries = append([]string{}, doc.Progress.Journal.Unlocked...)
	c.QuestLocations = decodeQuestLocations(doc.Progress.Quests.Locations)
}

var ErrIncomplete = spud.ErrIncomplete

func IsIncomplete(err error) bool {
	return errors.Is(err, spud.ErrIncomplete)
}
