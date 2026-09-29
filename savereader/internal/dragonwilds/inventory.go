package dragonwilds

import (
	"encoding/json"
	"sort"
	"strconv"
)

type Slot struct {
	Slot       int      `json:"slot"`
	Item       string   `json:"item"`
	Count      *int     `json:"count"`
	Durability *float64 `json:"durability"`
}

type Unlocks struct {
	Recipes          []string `json:"recipes"`
	Buildings        []string `json:"buildings"`
	ItemsPickedUp    []string `json:"items_picked_up"`
	ActorsInteracted []string `json:"actors_interacted"`
	CreaturesKilled  []string `json:"creatures_killed"`
}

type QuestLocation struct {
	ID    string `json:"id"`
	State bool   `json:"state"`
}

func absent(raw json.RawMessage) bool {
	return len(raw) == 0 || string(raw) == "null"
}

func decodeSlots(raw json.RawMessage) []Slot {
	if absent(raw) {
		return nil
	}
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil
	}
	slots := []Slot{}
	for key, value := range doc {
		index, err := strconv.Atoi(key)
		if err != nil || index < 0 {
			continue
		}
		var slot struct {
			Item       string   `json:"ItemData"`
			Count      *int     `json:"Count"`
			Durability *float64 `json:"Durability"`
		}
		if err := json.Unmarshal(value, &slot); err != nil || slot.Item == "" || (slot.Count != nil && *slot.Count < 0) {
			return nil
		}
		slots = append(slots, Slot{Slot: index, Item: slot.Item, Count: slot.Count, Durability: slot.Durability})
	}
	sort.Slice(slots, func(i, j int) bool { return slots[i].Slot < slots[j].Slot })
	return slots
}

func decodeUnlocks(raw json.RawMessage) *Unlocks {
	if absent(raw) {
		return nil
	}
	var doc struct {
		Recipes   []string `json:"RecipesUnlocked"`
		Buildings []string `json:"BuildingsUnlocked"`
		Items     []string `json:"ItemsPickedUp"`
		Actors    []string `json:"ActorsInteractedWith"`
		Creatures []string `json:"KilledOnceAIs"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil
	}
	return &Unlocks{Recipes: doc.Recipes, Buildings: doc.Buildings, ItemsPickedUp: doc.Items, ActorsInteracted: doc.Actors, CreaturesKilled: doc.Creatures}
}

func decodeQuestLocations(raw json.RawMessage) []QuestLocation {
	if absent(raw) {
		return nil
	}
	var doc []struct {
		ID    string `json:"QuestLocationId"`
		State bool   `json:"QuestLocationsState"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil
	}
	out := make([]QuestLocation, 0, len(doc))
	for _, entry := range doc {
		if entry.ID == "" {
			return nil
		}
		out = append(out, QuestLocation{ID: entry.ID, State: entry.State})
	}
	return out
}
