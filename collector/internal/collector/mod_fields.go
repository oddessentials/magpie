package collector

import (
	"fmt"
	"math"

	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/modevents"
)

func hasField(params map[string]any, keys ...string) bool {
	for _, key := range keys {
		if _, ok := params[key]; ok {
			return true
		}
	}
	return false
}

func nonnegativeInteger(params map[string]any, key string) (int, bool) {
	value, ok := modevents.Number(params, key)
	if !ok || value < 0 || value > math.MaxInt32 || math.Trunc(value) != value {
		return 0, false
	}
	return int(value), true
}

func (c *Collector) structuredModEvent(record modevents.Record, id event.Identity) (emission, bool) {
	params := record.Params
	other := c.modOther(record, id)
	userID, guid := optional(id.UserID), optional(id.CharacterGUID)
	makeEvent := func(kind string, data any) (emission, bool) {
		if id.Name == "" {
			return other, true
		}
		return emission{Type: kind, At: record.At, Player: id.Player(), Data: data}, true
	}
	switch record.Type {
	case modevents.TypeDeath:
		if !hasField(params, "DamageEvent") {
			return emission{}, false
		}
		data := event.PlayerDiedData{UserID: userID, CharacterGUID: guid, Name: id.Name, Source: event.SourceMod, Params: params}
		if damage, ok := modevents.Number(params, "DamageEvent", "DamageClass"); ok {
			causes := map[float64]string{1: "Melee", 2: "Magical", 3: "Ranged"}
			data.Cause = optional(causes[damage])
		}
		data.Killer = optional(modevents.AssetName(modevents.String(params, "DamageEvent", "Instigator")))
		if x, y, z, ok := modevents.Position(params, "DamageEvent", "VictimLocation"); ok {
			data.X, data.Y, data.Z = event.Float(x), event.Float(y), event.Float(z)
		}
		return makeEvent(event.TypePlayerDied, data)
	case modevents.TypeSkillLevel:
		if !hasField(params, "Skill") {
			return emission{}, false
		}
		skill := modevents.AssetName(modevents.String(params, "Skill"))
		level, ok := nonnegativeInteger(params, "NewLevel")
		if !ok || level == 0 || skill == "" {
			return other, true
		}
		return makeEvent(event.TypeSkillLevelUp, event.SkillLevelUpData{UserID: userID, CharacterGUID: guid, Name: id.Name, Skill: skill, Level: level})
	case modevents.TypeXP:
		if hasField(params, "XPEventRowHandle") {
			return other, true
		}
	case modevents.TypeXPChanged:
		if !hasField(params, "CurrentXP", "PreviousXP", "SkillData") {
			return emission{}, false
		}
		skill := modevents.AssetName(modevents.String(params, "SkillData"))
		xp, ok := nonnegativeInteger(params, "CurrentXP")
		if !ok || skill == "" {
			return other, true
		}
		data := event.PlayerXpData{UserID: userID, CharacterGUID: guid, Name: id.Name, Skill: skill, XP: float64(xp)}
		if previous, ok := nonnegativeInteger(params, "PreviousXP"); ok {
			data.Delta = event.Float(float64(xp - previous))
		}
		return makeEvent(event.TypePlayerXp, data)
	case modevents.TypeQuest:
		if !hasField(params, "UpdatedQuest") {
			return emission{}, false
		}
		quest := modevents.AssetName(modevents.String(params, "UpdatedQuest", "Data"))
		value, ok := modevents.Number(params, "UpdatedQuest", "State")
		state := event.QuestState(value)
		if !ok || quest == "" || state == "" {
			return other, true
		}
		return makeEvent(event.TypeQuestUpdated, event.QuestUpdatedData{UserID: userID, CharacterGUID: guid, Name: id.Name, Quest: quest, State: state, Objective: optional(modevents.String(params, "UpdatedQuest", "CurrentObjective"))})
	case modevents.TypeQuestComplete:
		if hasField(params, "bSilent") {
			return other, true
		}
	case modevents.TypeBuild:
		if hasField(params, "InBuildingPieceDataIndex", "SpawnTransform", "bSpawnGhost") {
			return other, true
		}
	case modevents.TypeBuildComplete:
		index, ok := nonnegativeInteger(params, "InBuildingPieceDataIndex")
		if !ok {
			return other, true
		}
		return makeEvent(event.TypeBuildingPlaced, event.BuildingPlacedData{UserID: userID, CharacterGUID: guid, Name: id.Name, Building: fmt.Sprintf("piece:%d", index)})
	case modevents.TypeCraft:
		if hasField(params, "Recipe", "BonusCount", "XPMultiplier") {
			return other, true
		}
	case modevents.TypeCraftResult:
		result, ok := nonnegativeInteger(params, "Result")
		recipe := modevents.AssetName(modevents.String(params, "Recipe"))
		count, counted := nonnegativeInteger(params, "Count")
		if !ok || result != 0 || recipe == "" || !counted || count == 0 {
			return other, true
		}
		return makeEvent(event.TypeItemCrafted, event.ItemCraftedData{UserID: userID, CharacterGUID: guid, Name: id.Name, Recipe: recipe, Count: event.Int(count)})
	}
	return emission{}, false
}
