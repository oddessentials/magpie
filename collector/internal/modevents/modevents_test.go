package modevents

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

const chatLine = `{"ChatMessageData":{"MessageBody":"hello there","SenderData":{"CharacterGuid":"ABCDEF0123456789ABCDEF0123456789","Color":{"A":1,"B":0.2,"G":0.5,"R":1},"PlayerId":256,"PrimaryNetId":{"ReplicationBytes":"[16]"},"SecondaryNetId":{"ReplicationBytes":"[0]"}}},"ChatPlayerFilterData":{"ReceiverIds":"[2]","SenderId":{"ReplicationBytes":"[16]"}},"hook":"/Script/JagexChatBackend.PlayerChatComponent:Server_SendChatMessage","owner":{"AccountGuid":{"NetIdPrimary":"[16]"},"CharacterGuid":{"InnerGuid":"ABCDEF0123456789ABCDEF0123456789"}},"platform":{"DisplayName":"Wanderer","PlatformName":"Steam","PlatformType":1,"UniqueID":"0123456789abcdef0123456789abcdef"},"player_name":"Wanderer","self":"PlayerChatComponent /Game/Maps/World/L_World.L_World:PersistentLevel.BP_PlayerController_C_1.PlayerChat","session_id":256,"ts":"2026-09-28T22:41:29Z","type":"chat","v":1}`

func TestParseKeepsParametersAndDropsIds(t *testing.T) {
	received := time.Date(2026, 9, 28, 23, 0, 0, 0, time.UTC)
	record, err := Parse(chatLine, received)
	if err != nil {
		t.Fatal(err)
	}
	if record.Type != "chat" || record.PlayerName != "Wanderer" || record.Platform != "steam" || record.Hook == "" || record.Self == "" {
		t.Fatalf("record %+v", record)
	}
	if !record.At.Equal(time.Date(2026, 9, 28, 22, 41, 29, 0, time.UTC)) {
		t.Fatalf("at %v", record.At)
	}
	if String(record.Params, "ChatMessageData", "MessageBody") != "hello there" {
		t.Fatalf("params %+v", record.Params)
	}
	if count, ok := Count(record.Params, "ChatPlayerFilterData", "ReceiverIds"); !ok || count != 2 {
		t.Fatalf("count %d %v", count, ok)
	}
	if id, ok := Number(record.Params, "ChatMessageData", "SenderData", "PlayerId"); ok || id != 0 {
		t.Fatal("PlayerId is an id and goes")
	}
	raw, _ := json.Marshal(record.Params)
	for _, gone := range []string{"NetId", "ReplicationBytes", "CharacterGuid", "UniqueID", "owner", "session_id", "0123456789abcdef", "ABCDEF0123456789"} {
		if strings.Contains(string(raw), gone) {
			t.Fatalf("%s survived: %s", gone, raw)
		}
	}
	if !strings.Contains(string(raw), `"Color"`) {
		t.Fatalf("plain fields stay: %s", raw)
	}
}

func TestParseStopLines(t *testing.T) {
	received := time.Now()
	record, err := Parse(`{"file":"D:\\rig\\magpie-stop.txt","ts":"2026-09-28T23:36:04Z","type":"stop_requested","v":1}`, received)
	if err != nil || record.Type != TypeStopRequested || len(record.Params) != 0 {
		t.Fatalf("%+v %v", record, err)
	}
	record, err = Parse(`{"SlotName":"magpie-rig","bSuccess":true,"hook":"/Script/Dominion.PersistenceSubsystem:PostSaveWorldState","self":"PersistenceSubsystem /Engine/Transient.X","ts":"2026-09-28T23:36:04Z","type":"save_done","v":1}`, received)
	if err != nil || record.Type != TypeSaveDone || record.Params["bSuccess"] != true || String(record.Params, "SlotName") != "magpie-rig" {
		t.Fatalf("%+v %v", record, err)
	}
	if _, err := Parse(`{"type":"chat","v":2,"ts":"x"}`, received); !errors.Is(err, ErrVersion) {
		t.Fatalf("version 2: %v", err)
	}
	if _, err := Parse(`{"v":1,"ts":"x"}`, received); err == nil {
		t.Fatal("a type is required")
	}
	if _, err := Parse(`not json`, received); err == nil {
		t.Fatal("garbage is an error")
	}
	record, _ = Parse(`{"type":"notice","v":1,"ts":"bad"}`, received)
	if !record.At.Equal(received) {
		t.Fatal("an unreadable ts falls back to the time the line was read")
	}
}

func TestTypeNames(t *testing.T) {
	cases := map[string]string{
		"base_raid":    "mod.base_raid",
		"Boss Summon!": "mod.boss_summon",
		"123":          "mod.event_123",
		"":             "mod.event_",
	}
	for kind, want := range cases {
		if got := TypeName(kind); got != want {
			t.Errorf("%q: got %s want %s", kind, got, want)
		}
	}
}

func TestFinders(t *testing.T) {
	params := map[string]any{
		"DeathData": map[string]any{
			"DeathCause": "Fall",
			"Location":   map[string]any{"X": 1.5, "Y": 2.5, "Z": 3.5},
			"KillerName": "Goblin",
			"Amount":     12.0,
		},
		"Level": 5.0,
	}
	if FindString(params, "cause") != "Fall" || FindString(params, "killer") != "Goblin" || FindString(params, "nothing") != "" {
		t.Fatal("strings")
	}
	if level, ok := FindNumber(params, "level"); !ok || level != 5 {
		t.Fatal("level")
	}
	if amount, ok := FindNumber(params, "amount"); !ok || amount != 12 {
		t.Fatal("nested number")
	}
	if x, y, z, ok := FindPosition(params); !ok || x != 1.5 || y != 2.5 || z != 3.5 {
		t.Fatal("position")
	}
	if AssetName("SkillData /Game/Gameplay/Character/Player/Skills/SKILL_Attack.SKILL_Attack") != "SKILL_Attack" || AssetName("/Game/Build/BP_Wall.BP_Wall_C") != "BP_Wall" || AssetName("") != "" {
		t.Fatal("asset names")
	}
}
