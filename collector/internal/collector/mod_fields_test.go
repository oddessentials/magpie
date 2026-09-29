package collector

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/oddessentials/magpie/collector/internal/contract"
	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/modevents"
	"github.com/oddessentials/magpie/collector/internal/serverlog"
)

func TestLuaCallbackFixturesBecomeConfirmedEvents(t *testing.T) {
	raw, err := os.ReadFile("testdata/mod-callbacks-25501739.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Records []struct {
			Raw  json.RawMessage `json:"raw"`
			Type string          `json:"expected_type"`
		} `json:"records"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	path, err := contract.Find()
	if err != nil {
		t.Fatal(err)
	}
	validator, err := contract.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	c := primedCollector(t)
	c.mapper.Map(serverlog.Record{Category: "LogNet", Message: "Login request: ?p=x?pf=PC?cpx=1?c?Name=Magpie Fixture userId: RedpointEOS:00000000000000000000000000000017 platform: RedpointEOS"}, time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC))
	c.mapper.Map(serverlog.Record{Category: "LogDominionPlayerControllerBase", Message: "PlayerChar entered world [Account[XP:00000000000000000000000000000017] Character Name[Magpie Fixture] Guid[DCG:00000000000000000000000000000018] Type[0]]"}, time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC))
	if id, ok := c.mapper.Identify("Magpie Fixture"); !ok || id.UserID != "00000000000000000000000000000017" {
		t.Fatal("fixture player was not identified from the log")
	}
	factory := event.NewFactory("00000000-0000-4000-8000-000000000099")
	var items []emission
	var exported []event.Event
	for index, sample := range fixture.Records {
		record, err := modevents.Parse(string(sample.Raw), time.Now())
		if err != nil {
			t.Fatal(err)
		}
		result := c.modEmissions(record)
		if len(result) != 1 || result[0].Type != sample.Type {
			t.Fatalf("%s: got %+v, want %s", record.Type, result, sample.Type)
		}
		item := result[0]
		created, err := factory.NewFor(item.Type, item.At, item.Player, item.Data)
		if err != nil {
			t.Fatal(err)
		}
		created.ID = fmt.Sprintf("00000000-0000-4000-8000-%012d", index+1)
		encoded, _ := created.Marshal()
		if err := validator.ValidateEvent(encoded); err != nil {
			t.Fatalf("%s: %v", record.Type, err)
		}
		items = append(items, item)
		exported = append(exported, created)
	}
	fixturePath := filepath.Join(filepath.Dir(path), "tests", "integration", "fixtures", "mod-events-25501739.json")
	encoded, _ := json.MarshalIndent(exported, "", "  ")
	if os.Getenv("MAGPIE_UPDATE_MOD_FIXTURE") == "1" {
		if err := os.MkdirAll(filepath.Dir(fixturePath), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(fixturePath, append(encoded, '\n'), 0644); err != nil {
			t.Fatal(err)
		}
	}
	stored, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatal(err)
	}
	var actual, expected any
	if err := json.Unmarshal(stored, &expected); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(encoded, &actual); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatal("signed-ingest fixture differs from collector output")
	}
	death := items[0].Data.(event.PlayerDiedData)
	if *death.X != 125.5 || *death.Y != -300 || *death.Z != 4 || *death.Cause != "Melee" || *death.Killer != "FixtureBoar" {
		t.Fatalf("death uses victim coordinates: %+v", death)
	}
	xp := items[3].Data.(event.PlayerXpData)
	if xp.XP != 250 || *xp.Delta != 75 || xp.Skill != "UnknownSkill" {
		t.Fatalf("XP: %+v", xp)
	}
	quest := items[4].Data.(event.QuestUpdatedData)
	if quest.Quest != "NewQuest" || quest.State != "completed" || *quest.Objective != "FindTheTemple" {
		t.Fatalf("quest must use UpdatedQuest: %+v", quest)
	}
	if built := items[7].Data.(event.BuildingPlacedData); built.Building != "piece:42" {
		t.Fatalf("unknown building index: %+v", built)
	}
	if crafted := items[10].Data.(event.ItemCraftedData); crafted.Recipe != "UnknownRecipe" || *crafted.Count != 3 {
		t.Fatalf("craft must use confirmed count: %+v", crafted)
	}
}

func TestStructuredModEventsDoNotGuessMissingOrInvalidValues(t *testing.T) {
	c := primedCollector(t)
	for _, line := range []string{
		`{"v":1,"type":"xp_changed","player_name":"Wanderer","CurrentXP":null,"PreviousXP":100,"SkillData":"Unknown"}`,
		`{"v":1,"type":"quest","player_name":"Wanderer","UpdatedQuest":{"Data":"New","State":99},"OldQuest":{"Data":"Old","State":2}}`,
		`{"v":1,"type":"build_complete","player_name":"Wanderer","InBuildingPieceDataIndex":-1}`,
		`{"v":1,"type":"craft_result","player_name":"Wanderer","Result":0,"Recipe":"FutureRecipe","Count":1.5}`,
		`{"v":1,"type":"craft_result","player_name":"Wanderer","Result":0,"Recipe":"FutureRecipe","Count":2147483648}`,
		`{"v":1,"type":"skill_level","player_name":"Wanderer","Skill":"FutureSkill","NewLevel":-1}`,
	} {
		record, err := modevents.Parse(line, time.Now())
		if err != nil {
			t.Fatal(err)
		}
		items := c.modEmissions(record)
		if len(items) != 1 || !strings.HasPrefix(items[0].Type, "mod.") {
			t.Fatalf("invalid fields became an outcome: %+v", items)
		}
	}
}
