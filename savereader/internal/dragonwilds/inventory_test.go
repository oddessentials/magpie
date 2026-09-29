package dragonwilds

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

const progressState = `{"meta_data":{"char_guid":"G","char_name":"Wanderer","char_type":0},"GameProgress":{"Character":{},"Skills":{"Skills":[{"Id":"s1","Xp":14}]},"Inventory":{"0":{"GUID":"slot-guid-a","ItemData":"item-a","Count":5},"11":{"GUID":"slot-guid-b","ItemData":"item-b"},"MaxSlotIndex":11},"Loadout":{"1":{"GUID":"slot-guid-c","ItemData":"armour","Durability":80},"MaxSlotIndex":1},"Progress":{"ItemsPickedUp":["item-a"],"ActorsInteractedWith":["BP_LoreItem_C"],"RecipesUnlocked":["r1","r2"],"BuildingsUnlocked":["b1"],"KilledOnceAIs":[]},"QuestProgress":{"Quests":[],"QuestLocations":[{"QuestLocationId":"WOM_Objective_FTUE_GS","QuestLocationsState":false},{"QuestLocationId":"Doric_Objective_FTUE_GS","QuestLocationsState":true}]},"Journal":{"UnlockedEntries":["j1","j2"],"UnreadEntries":["j2"]}}}`

func TestCharacterProgressSections(t *testing.T) {
	var c Character
	c.decode(progressState)
	if !c.Intact {
		t.Fatal("character not intact")
	}
	five, eighty := 5, 80.0
	if !reflect.DeepEqual(c.Inventory, []Slot{{Slot: 0, Item: "item-a", Count: &five}, {Slot: 11, Item: "item-b"}}) {
		t.Fatalf("inventory %+v", c.Inventory)
	}
	if !reflect.DeepEqual(c.Loadout, []Slot{{Slot: 1, Item: "armour", Durability: &eighty}}) {
		t.Fatalf("loadout %+v", c.Loadout)
	}
	want := &Unlocks{Recipes: []string{"r1", "r2"}, Buildings: []string{"b1"}, ItemsPickedUp: []string{"item-a"}, ActorsInteracted: []string{"BP_LoreItem_C"}, CreaturesKilled: []string{}}
	if !reflect.DeepEqual(c.Unlocks, want) {
		t.Fatalf("unlocks %+v", c.Unlocks)
	}
	if !reflect.DeepEqual(c.JournalEntries, []string{"j1", "j2"}) {
		t.Fatalf("journal %v", c.JournalEntries)
	}
	if !reflect.DeepEqual(c.QuestLocations, []QuestLocation{{ID: "WOM_Objective_FTUE_GS"}, {ID: "Doric_Objective_FTUE_GS", State: true}}) {
		t.Fatalf("quest locations %+v", c.QuestLocations)
	}
	encoded, _ := json.Marshal(c)
	if strings.Contains(string(encoded), "slot-guid") {
		t.Fatalf("slot guids leaked: %s", encoded)
	}
	if !strings.Contains(string(encoded), `"creatures_killed":[]`) || !strings.Contains(string(encoded), `"count":null`) {
		t.Fatalf("empty and unknown values: %s", encoded)
	}
}

func TestMalformedOrMissingProgressSectionsStayUnknown(t *testing.T) {
	cases := map[string]string{
		"inventory list":      strings.Replace(progressState, `"Inventory":{"0"`, `"Inventory":[],"Unused":{"0"`, 1),
		"negative count":      strings.Replace(progressState, `"Count":5`, `"Count":-1`, 1),
		"unlocks wrong type":  strings.Replace(progressState, `"RecipesUnlocked":["r1","r2"]`, `"RecipesUnlocked":7`, 1),
		"quest location id":   strings.Replace(progressState, `"QuestLocationId":"WOM_Objective_FTUE_GS"`, `"QuestLocationId":""`, 1),
		"quest location type": strings.Replace(progressState, `"QuestLocations":[`, `"QuestLocations":{"a":[`, 1),
	}
	for name, state := range cases {
		t.Run(name, func(t *testing.T) {
			var c Character
			c.decode(state)
			if name == "quest location type" {
				if c.Intact {
					t.Fatal("a character whose JSON does not parse is not intact")
				}
				return
			}
			if !c.Intact || len(c.Skills) != 1 {
				t.Fatalf("one bad section must not drop the character: %+v", c)
			}
			switch name {
			case "inventory list", "negative count":
				if c.Inventory != nil || c.Loadout == nil {
					t.Fatalf("inventory %+v loadout %+v", c.Inventory, c.Loadout)
				}
			case "unlocks wrong type":
				if c.Unlocks != nil || c.Inventory == nil {
					t.Fatalf("unlocks %+v", c.Unlocks)
				}
			case "quest location id":
				if c.QuestLocations != nil || c.Unlocks == nil {
					t.Fatalf("quest locations %+v", c.QuestLocations)
				}
			}
		})
	}
	var missing Character
	missing.decode(`{"meta_data":{"char_guid":"G","char_name":"W","char_type":0},"GameProgress":{"Character":{},"Progress":{"RecipesUnlocked":["r1"]}}}`)
	if missing.Inventory != nil || missing.Loadout != nil || missing.QuestLocations != nil || missing.Unlocks == nil || missing.Unlocks.Buildings != nil || !reflect.DeepEqual(missing.JournalEntries, []string{}) {
		t.Fatalf("missing sections and lists are unknown: %+v", missing)
	}
}
