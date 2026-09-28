package dragonwilds_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/oddessentials/magpie/savereader/internal/dragonwilds"
	"github.com/oddessentials/magpie/savereader/internal/spud"
	st "github.com/oddessentials/magpie/savereader/internal/spud/spudtest"
)

const (
	worldGUID    = "12B419C047A67AD218B7FB86A39D624C"
	password     = "hunter2-do-not-print"
	firstGUID    = "21CB800A41067666EB379A8674F38B90"
	secondGUID   = "0A0B0C0D1A1B1C1D2A2B2C2D3A3B3C3D"
	classStates  = "/Script/Dominion.CachedCharacterStates"
	classMoves   = "/Script/Dominion.SavedCharacterTransformsManager"
	classWeather = "/Game/Gameplay/World/Weather/BP_WeatherActor.BP_WeatherActor_C"
	classEvents  = "/Game/Gameplay/Events/BP_WorldEventManager.BP_WorldEventManager_C"
	classTime    = "/Game/Gameplay/World/Time/BP_InGameTimeActor.BP_InGameTimeActor_C"
	weatherJSON  = `{"Version":83,"Definitions":[{"WeatherName":"base","WeatherData":{"ALT_PROFILE":false,"TYPE":"EWeatherType::Cloudy","DAY_COUNT":1,"REMAINING_TIME":11765.19}},{"WeatherName":"sands","WeatherData":{"ALT_PROFILE":true,"TYPE":"EWeatherType::Sunny","DAY_COUNT":3,"REMAINING_TIME":1492.06}}]}`
	eventsJSON   = `{"Version":83,"Definitions":[{"EventName":"base_raid_bm_1","EventData":{"Triggers":[{"TriggerName":"cooldown","TriggerData":{"CurrentValue":true,"TriggerTime":"+4.03:29:59.998"}},{"TriggerName":"during_the_night","TriggerData":{"CurrentValue":false}}]}},{"EventName":"dragon_imaru_breath","EventData":{"Triggers":[]}}]}`
)

var savedAt = time.Date(2026, 9, 28, 18, 14, 27, 744000000, time.UTC)

func field(name string, data []byte) st.Field {
	return st.Field{Name: name, Data: data}
}

func i32(v int32) []byte {
	return new(st.Buffer).I32(v).Bytes()
}

func headerFields(stamp time.Time) []st.Field {
	ticks := stamp.UnixNano()/100 + 621355968000000000
	guid := st.GUIDBytes(worldGUID)
	return []st.Field{
		field("VERSION", i32(9)),
		field("GUID_A", guid[0:4]),
		field("GUID_B", guid[4:8]),
		field("GUID_C", guid[8:12]),
		field("GUID_D", guid[12:16]),
		field("WorldName", st.String("Test World")),
		field("WorldMapName", st.String("L_World")),
		field("FriendlyFire", []byte{1}),
		field("SurvivalDifficulty", i32(2)),
		field("HardcoreState", i32(1)),
		field("TimeOfSave", new(st.Buffer).I64(ticks).Bytes()),
		field("SessionPrivacy", i32(3)),
		field("SessionPasswd", st.String(password)),
		field("CrossplayEnabled", i32(1)),
		field("WorldOwnerId", st.String("")),
		field("WorldNameOwner", st.String("")),
		field("LastSavedBy", st.String("++dominion+hotfix:244954")),
		field("Meta_SaveFileRevision", i32(7)),
	}
}

func state(name, guid string) string {
	return fmt.Sprintf(`{"Version":83,"meta_data":{"char_guid":%q,"worlds_playtime":{%q:1790633667},"char_name":%q,"char_type":0},"SaveCount":5,"Customization":{},"Hardcore":{"IsHardcore":true,"AssociatedWorld":%q},"GameProgress":{"Version":83,"Character":{"Playtime_sim":973.3,"Playtime_wall":973.15,"Health":{"CurrentValue":87.5},"Stamina":{"CurrentValue":100}},"Inventory":{"MaxSlotIndex":-1},"QuestProgress":{"Quests":[{"QuestId":"q1","QuestState":2,"QuestObjective":"Objective1","QuestInts":[],"QuestBools":[]},{"QuestId":"q2","QuestState":0,"QuestObjective":"None","QuestInts":[],"QuestBools":[]}]},"Skills":{"Skills":[{"Id":"s1","Xp":14},{"Id":"s2","Xp":0}]},"Journal":{"UnlockedEntries":["j1","j2","j3"],"UnreadEntries":["j3"]},"Spellcasting":{"SelectedSpells":["","spell_a","","spell_b"]}},"Backup":4109958831}`, guid, worldGUID, name, worldGUID)
}

func character(guid, state string) []byte {
	return st.Entry(st.CharacterGUID("CharacterGuid", guid), st.Str("State", state), st.Float("LastUpdated", 1441.5))
}

func move(guid string, x, y, z float64) []byte {
	return st.Entry(st.CharacterGUID("CharacterGuid", guid), st.Transform("Transform", x, y, z), st.Float("LastUpdated", 1441.5))
}

func damageable(name string, kind uint16) []st.Prop {
	return []st.Prop{{Name: name, Type: kind}, {Name: "bCanBeDamaged", Type: spud.TypeUInt8}}
}

func worldLevel(characters, moves [][]byte) st.Level {
	core := []byte{1, 0, 0, 0}
	return st.Level{
		Name: "L_World",
		Classes: []st.Class{
			{Name: classStates, Props: damageable("CachedCharacterStates", spud.TypeRecord)},
			{Name: classMoves, Props: damageable("SavedCharacterTransforms", spud.TypeRecord)},
			{Name: classWeather, Props: damageable("WeathersJSONData", spud.TypeString)},
			{Name: classEvents, Props: []st.Prop{
				{Name: "Ticks", Prefix: "LastEventStartTimespan", Type: spud.TypeInt64},
				{Name: "GroupTagToEventStartMap", Type: spud.TypeRecord},
				{Name: "DefinitionsJSONData", Type: spud.TypeString},
				{Name: "bCanBeDamaged", Type: spud.TypeUInt8},
			}},
			{Name: classTime, Props: damageable("StoredTime", spud.TypeFloat)},
		},
		Objects: []st.Object{
			{Class: classStates, Name: "CachedCharacterStates_UAID_1", Core: core, Values: [][]byte{st.Record(characters...), {1}}},
			{Class: classMoves, Name: "SavedCharacterTransformsManager_UAID_1", Core: core, Values: [][]byte{st.Record(moves...), {1}}},
			{Class: classWeather, Name: "BP_WeatherActor_C_UAID_1", Core: core, Values: [][]byte{st.String(weatherJSON), {1}}},
			{Class: classEvents, Name: "WorldEventManager_UAID_1", Core: core, Values: [][]byte{new(st.Buffer).I64(1067770970112).Bytes(), new(st.Buffer).I32(0).I32(0).Bytes(), st.String(eventsJSON), {1}}},
			{Class: classTime, Name: "BP_InGameTimeActor_C_UAID_1", Core: core, Values: [][]byte{new(st.Buffer).F32(2671.5).Bytes(), {1}}},
		},
	}
}

func newSave(characters, moves [][]byte) st.Save {
	global := st.Level{
		Name:    "L_World",
		Classes: []st.Class{{Name: "/Script/Dominion.PersistenceSubsystem", Props: []st.Prop{{Name: "WorldName", Prefix: "WorldSaveSettings", Type: spud.TypeString}}}},
		Objects: []st.Object{{Class: "/Script/Dominion.PersistenceSubsystem", Name: "DomPersistence", Values: [][]byte{st.String("Test World")}}},
	}
	cell := st.Level{
		Name:    "RSACell12800_X1_Y13",
		Classes: []st.Class{{Name: "/Game/Gameplay/World/Spawners/BP_Spawner_Stone.BP_Spawner_Stone_C", Props: damageable("RespawnAt", spud.TypeInt64)}},
		Objects: []st.Object{{Class: "/Game/Gameplay/World/Spawners/BP_Spawner_Stone.BP_Spawner_Stone_C", Name: "BP_Spawner_Stone_C_UAID_1", Core: []byte{1}, Custom: []byte{2}, Values: [][]byte{new(st.Buffer).I64(5).Bytes(), {1}}}},
	}
	return st.Save{
		SystemVersion: 8,
		Timestamp:     "2026-09-28T18:14:27.756Z",
		Fields:        headerFields(savedAt),
		CurrentLevel:  "L_World",
		Global:        global,
		Levels:        []st.Level{worldLevel(characters, moves), cell},
	}
}

func decode(t *testing.T, save st.Save) *dragonwilds.World {
	t.Helper()
	world, err := dragonwilds.Decode(save.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	return world
}

func encode(t *testing.T, world *dragonwilds.World) string {
	t.Helper()
	out, err := json.Marshal(world)
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
}

func TestDecodesAWorldSave(t *testing.T) {
	characters := [][]byte{character(firstGUID, state("Tester", firstGUID)), character(secondGUID, `{"Version":83,"meta_data":`)}
	moves := [][]byte{move(firstGUID, 25131, 179918.62, -4103.9), move(secondGUID, 1, 2, 3)}
	world := decode(t, newSave(characters, moves))
	if !world.SavedAt.Equal(savedAt) || world.SystemVersion != 8 {
		t.Fatalf("saved at %v, system %d", world.SavedAt, world.SystemVersion)
	}
	h := world.World
	if h.Name != "Test World" || h.Map != "L_World" || h.GUID != worldGUID || h.LastSavedBy != "++dominion+hotfix:244954" || h.OwnerID != "" || h.OwnerName != "" {
		t.Fatalf("header %+v", h)
	}
	if *h.Version != 9 || !*h.FriendlyFire || *h.SurvivalDifficulty != 2 || *h.HardcoreState != 1 || *h.SessionPrivacy != 3 || !*h.Crossplay || *h.Revision != 7 {
		t.Fatalf("header %+v", h)
	}
	if len(world.Weather) != 2 || world.Weather[0] != (dragonwilds.Weather{Region: "base", Type: "EWeatherType::Cloudy", DayCount: 1, RemainingTime: 11765.19}) || !world.Weather[1].AltProfile || world.Weather[1].DayCount != 3 {
		t.Fatalf("weather %+v", world.Weather)
	}
	if len(world.Events) != 2 || world.Events[0].Name != "base_raid_bm_1" || len(world.Events[0].Triggers) != 2 || len(world.Events[1].Triggers) != 0 {
		t.Fatalf("events %+v", world.Events)
	}
	cooldown, night := world.Events[0].Triggers[0], world.Events[0].Triggers[1]
	if cooldown.Name != "cooldown" || cooldown.Value != true || cooldown.Time == nil || *cooldown.Time != "+4.03:29:59.998" || night.Value != false || night.Time != nil {
		t.Fatalf("triggers %+v %+v", cooldown, night)
	}
	if len(world.Characters) != 2 {
		t.Fatalf("characters %+v", world.Characters)
	}
	c := world.Characters[0]
	if c.GUID != firstGUID || !c.Intact || c.Name != "Tester" || c.Type != 0 || c.Version != 83 || c.SaveCount != 5 || !c.Hardcore {
		t.Fatalf("character %+v", c)
	}
	if c.WorldsPlaytime[worldGUID] != 1790633667 || c.PlaytimeSim != 973.3 || c.PlaytimeWall != 973.15 || c.Health != 87.5 || c.Stamina != 100 {
		t.Fatalf("character %+v", c)
	}
	if len(c.Skills) != 2 || c.Skills[0] != (dragonwilds.Skill{ID: "s1", XP: 14}) || len(c.Quests) != 2 || c.Quests[0] != (dragonwilds.Quest{ID: "q1", State: 2, Objective: "Objective1"}) {
		t.Fatalf("progress %+v", c)
	}
	if c.Journal != (dragonwilds.Journal{Unlocked: 3, Unread: 1}) || c.SpellsSelected != 2 {
		t.Fatalf("journal %+v spells %d", c.Journal, c.SpellsSelected)
	}
	if c.Position == nil || *c.Position != (dragonwilds.Position{X: 25131, Y: 179918.62, Z: -4103.9}) {
		t.Fatalf("position %+v", c.Position)
	}
	broken := world.Characters[1]
	if broken.GUID != secondGUID || broken.Intact || broken.Name != "" || len(broken.Skills) != 0 || broken.Position == nil || broken.Position.X != 1 {
		t.Fatalf("broken character %+v", broken)
	}
	out := encode(t, world)
	for _, want := range []string{`"skills":[]`, `"quests":[]`, `"worlds_playtime":{}`, `"intact":false`, `"time":null`} {
		if !strings.Contains(out, want) {
			t.Fatalf("output lacks %s: %s", want, out)
		}
	}
}

func TestNeverEmitsThePassword(t *testing.T) {
	out := encode(t, decode(t, newSave(nil, nil)))
	if strings.Contains(out, password) || strings.Contains(strings.ToLower(out), "passw") {
		t.Fatalf("the password leaked: %s", out)
	}
}

func TestAnEmptyWorldHasEmptyLists(t *testing.T) {
	save := newSave(nil, nil)
	save.Levels[0].Objects = save.Levels[0].Objects[:2]
	world := decode(t, save)
	out := encode(t, world)
	for _, want := range []string{`"weather":[]`, `"events":[]`, `"characters":[]`} {
		if !strings.Contains(out, want) {
			t.Fatalf("output lacks %s: %s", want, out)
		}
	}
	save.Levels = nil
	if world := decode(t, save); len(world.Characters) != 0 || world.World.Name != "Test World" {
		t.Fatalf("no levels: %+v", world)
	}
}

func TestFallsBackToTheSaveTimestamp(t *testing.T) {
	save := newSave(nil, nil)
	var fields []st.Field
	for _, f := range save.Fields {
		if f.Name != "TimeOfSave" && f.Name != "GUID_C" && f.Name != "HardcoreState" {
			fields = append(fields, f)
		}
	}
	save.Fields = fields
	world := decode(t, save)
	if !world.SavedAt.Equal(time.Date(2026, 9, 28, 18, 14, 27, 756000000, time.UTC)) {
		t.Fatalf("saved at %v", world.SavedAt)
	}
	if world.World.GUID != "" || world.World.HardcoreState != nil || *world.World.Revision != 7 {
		t.Fatalf("header %+v", world.World)
	}
	save.Fields = nil
	save.Timestamp = "yesterday"
	if _, err := dragonwilds.Decode(save.Bytes()); err == nil || !strings.Contains(err.Error(), "time") {
		t.Fatalf("no time: %v", err)
	}
}

func TestRejectsIncompleteAndMalformedSaves(t *testing.T) {
	data := newSave(nil, nil).Bytes()
	_, err := dragonwilds.Decode(data[:len(data)-100])
	if !dragonwilds.IsIncomplete(err) {
		t.Fatalf("truncated: %v", err)
	}
	save := newSave(nil, nil)
	save.Levels[0].Objects[2].Values[0] = st.String(`{"Definitions":`)
	if _, err := dragonwilds.Decode(save.Bytes()); err == nil || !strings.Contains(err.Error(), "WeathersJSONData") {
		t.Fatalf("bad weather: %v", err)
	}
	save = newSave([][]byte{st.Entry(st.Str("State", "{}"))}, nil)
	if _, err := dragonwilds.Decode(save.Bytes()); err == nil || !strings.Contains(err.Error(), "CharacterGuid") {
		t.Fatalf("no guid: %v", err)
	}
	if _, err := dragonwilds.ReadFile("missing.sav"); err == nil {
		t.Fatal("a missing file read")
	}
}
