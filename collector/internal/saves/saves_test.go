package saves

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/oddessentials/magpie/collector/internal/event"
)

const readerOutput = `{"format":1,"saved_at":"2026-09-28T19:41:02.294Z","system_version":8,"world":{"version":9,"guid":"1234567890abcdef1234567890abcdef","name":"Test World","map":"L_World","friendly_fire":false,"survival_difficulty":0,"hardcore_state":1,"session_privacy":3,"crossplay":true,"owner_id":"","owner_name":"","last_saved_by":"++dominion+hotfix:244954","revision":13},"weather":[{"region":"base","type":"EWeatherType::Cloudy","alt_profile":false,"day_count":2,"remaining_time":769.166}],"events":[{"name":"base_raid_bm_1","triggers":[{"name":"delay_at_start","value":false,"time":"+9.15:29:59.998"},{"name":"cooldown","value":true,"time":"+4.03:29:59.998"}]}],"characters":[{"guid":"ABCDEF0123456789ABCDEF0123456789","intact":true,"name":"Wanderer","type":0,"version":3,"save_count":5,"hardcore":false,"worlds_playtime":{"1234567890ABCDEF1234567890ABCDEF":3600.5},"playtime_sim":3500,"playtime_wall":3600.5,"health":80,"stamina":100,"skills":[{"id":"4pefO9k1lUqfA6mvHNi1SA","xp":150}],"quests":[{"id":"quest-1","state":2,"objective":"talk"}],"journal":{"unlocked":40,"unread":3},"spells_selected":1,"position":{"x":1,"y":2,"z":3}},{"guid":"0123456789ABCDEF0123456789ABCDEF","intact":false,"name":"","type":0,"version":0,"save_count":0,"hardcore":false,"worlds_playtime":null,"playtime_sim":0,"playtime_wall":0,"health":0,"stamina":0,"skills":null,"quests":null,"journal":{"unlocked":0,"unread":0},"spells_selected":0,"position":null}]}`

func TestDecodeAndTrack(t *testing.T) {
	result, err := Decode([]byte(readerOutput), 487351)
	if err != nil {
		t.Fatal(err)
	}
	world := result.World
	if world.WorldGUID != "1234567890ABCDEF1234567890ABCDEF" || *world.WorldName != "Test World" || *world.SizeBytes != 487351 || *world.LastSavedBy != "++dominion+hotfix:244954" {
		t.Fatalf("world %+v", world)
	}
	if len(world.Weather) != 1 || world.Weather[0].Type != "Cloudy" || *world.Weather[0].DayCount != 2 || *world.Weather[0].RemainingS != 769.166 {
		t.Fatalf("weather %+v", world.Weather)
	}
	if len(world.Events) != 1 || world.Events[0].ID != "base_raid_bm_1" || *world.Events[0].State != "cooldown" {
		t.Fatalf("events %+v", world.Events)
	}
	if world.Hardcore != nil || *world.HardcoreState != 1 || world.FriendlyFire == nil || *world.FriendlyFire {
		t.Fatalf("flags %+v", world)
	}
	if len(result.Characters) != 1 || len(result.GUIDs) != 2 || result.GUIDs[0] != "0123456789ABCDEF0123456789ABCDEF" {
		t.Fatalf("characters %d guids %v", len(result.Characters), result.GUIDs)
	}
	player := result.Characters[0]
	if player.CharacterGUID != "ABCDEF0123456789ABCDEF0123456789" || player.Name != "Wanderer" || *player.PlaytimeS != 3600.5 || player.Health != nil || *player.HealthCurrent != 80 {
		t.Fatalf("player %+v", player)
	}
	if len(player.Skills) != 1 || player.Skills[0].ID != "4pefO9k1lUqfA6mvHNi1SA" || player.Skills[0].XP != 150 {
		t.Fatalf("skills %+v", player.Skills)
	}
	if len(player.Quests) != 1 || player.Quests[0].State != "2" || *player.Quests[0].Objective != "talk" || *player.JournalUnlocked != 40 || *player.Spells != 1 {
		t.Fatalf("quests %+v", player.Quests)
	}
	tracker := NewTracker()
	first := tracker.Changes(result)
	if kinds(first) != "save.world save.player save.read" {
		t.Fatalf("first read: %s", kinds(first))
	}
	read := first[2].Data.(event.SaveReadData)
	if read.WorldGUID != world.WorldGUID || len(read.CharacterGUIDs) != 2 {
		t.Fatalf("read %+v", read)
	}
	second := tracker.Changes(result)
	if kinds(second) != "save.world save.read" {
		t.Fatalf("unchanged characters are not resent: %s", kinds(second))
	}
	changed, _ := Decode([]byte(strings.Replace(readerOutput, `"xp":150`, `"xp":175`, 1)), 1)
	third := tracker.Changes(changed)
	if kinds(third) != "save.world save.player save.read" {
		t.Fatalf("a changed character is resent: %s", kinds(third))
	}
}

func kinds(items []Emission) string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		names = append(names, item.Type)
	}
	return strings.Join(names, " ")
}

func TestDecodeRejectsOtherFormats(t *testing.T) {
	if _, err := Decode([]byte(strings.Replace(readerOutput, `"format":1`, `"format":2`, 1)), 1); err == nil || !strings.Contains(err.Error(), "format 2") {
		t.Fatalf("format: %v", err)
	}
	if _, err := Decode([]byte(`{"format":1}`), 1); err == nil {
		t.Fatal("a save without a time or guid is refused")
	}
}

func TestSavedWorldProgressAndBuildingCounts(t *testing.T) {
	base := strings.TrimSuffix(readerOutput, "}")
	raw := base + `,"progress":{"world_hooks":["hook"],"defeated_bosses":["unknown-boss"],"values":[{"tag":"World.Test","value":2.5}]},"buildings":[{"data_id":"wall","unfinished":false},{"data_id":"wall","unfinished":true},{"data_id":"door","unfinished":false}]}`
	result, err := Decode([]byte(raw), 1)
	if err != nil {
		t.Fatal(err)
	}
	if result.World.Progress.Values[0].Value != 2.5 || result.World.Progress.DefeatedBosses[0] != "unknown-boss" {
		t.Fatalf("progress %+v", result.World.Progress)
	}
	b := result.World.Buildings
	if b.Total != 3 || b.Unfinished != 1 || len(b.Types) != 2 || b.Types[0].ID != "door" || b.Types[1].Count != 2 {
		t.Fatalf("buildings %+v", b)
	}
	old, err := Decode([]byte(readerOutput), 1)
	if err != nil || old.World.Progress != nil || old.World.Buildings != nil {
		t.Fatal("missing fields must stay unknown")
	}
	empty, err := Decode([]byte(base+`,"buildings":[]}`), 1)
	if err != nil || empty.World.Buildings == nil || empty.World.Buildings.Total != 0 {
		t.Fatal("known empty buildings must stay available")
	}
}

func TestLocatePrefersTheNamedWorldThenTheNewest(t *testing.T) {
	dir := t.TempDir()
	old := filepath.Join(dir, "old.sav")
	newest := filepath.Join(dir, "new.sav")
	os.WriteFile(old, []byte("x"), 0o644)
	os.WriteFile(newest, []byte("y"), 0o644)
	os.WriteFile(filepath.Join(dir, "new.sav.backup"), []byte("z"), 0o644)
	past := time.Now().Add(-time.Hour)
	os.Chtimes(old, past, past)
	if got, ok := Locate(dir, "old"); !ok || got != old {
		t.Fatalf("named: %s %v", got, ok)
	}
	if got, ok := Locate(dir, "missing"); !ok || got != newest {
		t.Fatalf("newest: %s %v", got, ok)
	}
	if _, ok := Locate(filepath.Join(dir, "nowhere"), ""); ok {
		t.Fatal("a missing folder has no save")
	}
}
