package collector

import (
	"context"
	"path/filepath"
	"strings"

	"github.com/oddessentials/magpie/collector/internal/config"
	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/modevents"
	"github.com/oddessentials/magpie/collector/internal/serverlog"
)

const modCursorFile = "mod-events.cursor"

func (c *Collector) modEnabled() bool {
	return c.cfg.Mod.Events != ""
}

func (c *Collector) runMod(ctx context.Context, done <-chan struct{}) {
	source := &serverlog.FileSource{
		Path:       c.cfg.Mod.Events,
		CursorPath: filepath.Join(c.cfg.JournalDir, modCursorFile),
	}
	source.Run(ctx, &sink{lines: c.modLines, states: c.modStates, done: done})
}

func (c *Collector) modStateName() string {
	switch {
	case !c.modEnabled():
		return stateOff
	case c.modState == serverlog.StateConnected:
		return stateOK
	}
	return stateWaiting
}

func (c *Collector) onModState(state sourceState) {
	previous := c.modState
	c.modState = state.state
	if state.state == serverlog.StateConnected && previous != serverlog.StateConnected {
		c.log.Info("reading the events mod's file", "file", c.cfg.Mod.Events)
	}
}

func (c *Collector) onModLine(line serverlog.Line) {
	if line.Reset {
		return
	}
	record, err := modevents.Parse(line.Text, line.ReceivedAt)
	if err != nil {
		if !c.modWarned {
			c.modWarned = true
			c.log.Warn("the events mod wrote a line the collector does not understand", "error", err)
		}
		return
	}
	for _, item := range c.modEmissions(record) {
		c.emit(item.Type, item.At, item.Player, item.Data)
	}
}

func optional(value string) *string {
	if value == "" {
		return nil
	}
	return event.String(value)
}

func (c *Collector) modIdentity(record modevents.Record) event.Identity {
	id, _ := c.mapper.Identify(record.PlayerName)
	if id.Platform == "" {
		id.Platform = record.Platform
	}
	return id
}

func (c *Collector) modOther(record modevents.Record, id event.Identity) emission {
	data := record.Params
	if data == nil {
		data = map[string]any{}
	}
	return emission{Type: modevents.TypeName(record.Type), At: record.At, Player: id.Player(), Data: data}
}

func (c *Collector) stopState() (bool, string) {
	c.stopMu.Lock()
	defer c.stopMu.Unlock()
	by := c.stopBy
	if by == "" {
		by = stopByUnknown
	}
	return c.stopping || c.expectShutdown.Load(), by
}

func (c *Collector) modEmissions(record modevents.Record) []emission {
	id := c.modIdentity(record)
	params := record.Params
	userID, guid := optional(id.UserID), optional(id.CharacterGUID)
	switch record.Type {
	case modevents.TypeStopRequested:
		if c.cfg.Logs.Source == config.SourceFile && !c.serverUp {
			return nil
		}
		stopping, by := c.stopState()
		c.stopMu.Lock()
		announced := c.stopSignaled
		c.stopSignaled = true
		if !stopping {
			by = StopFileBy(c.cfg.Mod.Stop)
			c.stopBy = by
		}
		c.stopMu.Unlock()
		if !stopping {
			c.expectShutdown.Store(true)
		}
		if announced {
			return nil
		}
		return []emission{{Type: event.TypeServerStopping, At: record.At, Data: event.ServerStoppingData{By: event.String(by), Save: event.String(event.SaveRequested)}}}
	case modevents.TypeSaveDone, modevents.TypeSaveFailed:
		stopping, by := c.stopState()
		if !stopping {
			return []emission{c.modOther(record, id)}
		}
		state := event.SaveDone
		if record.Type == modevents.TypeSaveFailed {
			state = event.SaveFailed
		} else if ok, found := params["bSuccess"].(bool); found && !ok {
			state = event.SaveFailed
		}
		return []emission{{Type: event.TypeServerStopping, At: record.At, Data: event.ServerStoppingData{By: event.String(by), Save: event.String(state)}}}
	case modevents.TypeChat:
		text := modevents.String(params, "ChatMessageData", "MessageBody")
		if text == "" {
			text = modevents.FindString(params, "messagebody", "message", "body", "text")
		}
		if text == "" || record.PlayerName == "" {
			return []emission{c.modOther(record, id)}
		}
		channel := "global"
		var recipients *int
		if count, ok := modevents.Count(params, "ChatPlayerFilterData", "ReceiverIds"); ok {
			recipients = event.Int(count)
			if count > 0 {
				channel = "direct"
			}
		}
		return []emission{{Type: event.TypeChatMessage, At: record.At, Player: id.Player(), Data: event.ChatMessageData{
			UserID: userID, CharacterGUID: guid, Name: id.Name, Channel: channel, Text: truncate(text, 2000), Recipients: recipients,
		}}}
	case modevents.TypePlayerEvent:
		tag := modevents.FindString(params, "tag", "event", "type")
		if tag == "" || record.PlayerName == "" {
			return []emission{c.modOther(record, id)}
		}
		return []emission{{Type: event.TypePlayerEvent, At: record.At, Player: id.Player(), Data: event.PlayerEventData{UserID: userID, CharacterGUID: guid, Name: id.Name, Tag: tag}}}
	case modevents.TypeDeath:
		if record.PlayerName == "" {
			return []emission{c.modOther(record, id)}
		}
		data := event.PlayerDiedData{
			UserID: userID, CharacterGUID: guid, Name: id.Name, Source: event.SourceMod,
			Cause:  optional(modevents.FindString(params, "cause", "damagetype", "reason", "source")),
			Killer: optional(modevents.FindString(params, "killer", "attacker", "instigator")),
			Params: params,
		}
		if x, y, z, ok := modevents.FindPosition(params); ok {
			data.X, data.Y, data.Z = event.Float(x), event.Float(y), event.Float(z)
		}
		return []emission{{Type: event.TypePlayerDied, At: record.At, Player: id.Player(), Data: data}}
	case modevents.TypeRespawn:
		if record.PlayerName == "" {
			return []emission{c.modOther(record, id)}
		}
		data := event.PlayerRespawnedData{UserID: userID, CharacterGUID: guid, Name: id.Name}
		if x, y, z, ok := modevents.FindPosition(params); ok {
			data.X, data.Y, data.Z = event.Float(x), event.Float(y), event.Float(z)
		}
		return []emission{{Type: event.TypePlayerRespawned, At: record.At, Player: id.Player(), Data: data}}
	case modevents.TypeKicked:
		return []emission{{Type: event.TypePlayerKicked, At: record.At, Player: id.Player(), Data: event.PlayerKickedData{
			UserID: userID, CharacterGUID: guid, Name: optional(id.Name), Reason: optional(modevents.FindString(params, "reason", "message", "text")),
		}}}
	case modevents.TypeAdminAction:
		action := modevents.FindString(params, "action", "kind", "type", "command")
		if action == "" {
			if _, suffix, found := strings.Cut(record.Hook, ":"); found {
				action = suffix
			}
		}
		if action == "" || record.PlayerName == "" {
			return []emission{c.modOther(record, id)}
		}
		return []emission{{Type: event.TypeAdminAction, At: record.At, Player: id.Player(), Data: event.AdminActionData{
			UserID: userID, CharacterGUID: guid, Name: id.Name, Action: action, Target: optional(modevents.FindString(params, "target", "user", "player")),
		}}}
	case modevents.TypeSkillLevel:
		skill := modevents.AssetName(modevents.FindString(params, "skill", "data"))
		level, ok := modevents.FindNumber(params, "level")
		if skill == "" || !ok || level < 1 || record.PlayerName == "" {
			return []emission{c.modOther(record, id)}
		}
		return []emission{{Type: event.TypeSkillLevelUp, At: record.At, Player: id.Player(), Data: event.SkillLevelUpData{
			UserID: userID, CharacterGUID: guid, Name: id.Name, Skill: skill, Level: int(level),
		}}}
	case modevents.TypeXP, modevents.TypeXPChanged:
		skill := modevents.AssetName(modevents.FindString(params, "skill", "data"))
		xp, ok := modevents.FindNumber(params, "xp", "total", "current", "new")
		if skill == "" || !ok || xp < 0 || record.PlayerName == "" {
			return []emission{c.modOther(record, id)}
		}
		data := event.PlayerXpData{UserID: userID, CharacterGUID: guid, Name: id.Name, Skill: skill, XP: xp}
		if delta, ok := modevents.FindNumber(params, "delta", "amount", "added", "gained"); ok {
			data.Delta = event.Float(delta)
		}
		return []emission{{Type: event.TypePlayerXp, At: record.At, Player: id.Player(), Data: data}}
	case modevents.TypeQuest, modevents.TypeQuestComplete:
		quest := modevents.AssetName(modevents.FindString(params, "quest", "data"))
		if quest == "" || record.PlayerName == "" {
			return []emission{c.modOther(record, id)}
		}
		state := modevents.FindString(params, "state", "status")
		if record.Type == modevents.TypeQuestComplete {
			state = "completed"
		}
		if state == "" {
			state = "updated"
		}
		return []emission{{Type: event.TypeQuestUpdated, At: record.At, Player: id.Player(), Data: event.QuestUpdatedData{
			UserID: userID, CharacterGUID: guid, Name: id.Name, Quest: quest, State: state, Objective: optional(modevents.FindString(params, "objective")),
		}}}
	case modevents.TypeBuild:
		building := modevents.AssetName(modevents.FindString(params, "building", "piece", "class", "data", "recipe"))
		if building == "" || record.PlayerName == "" {
			return []emission{c.modOther(record, id)}
		}
		return []emission{{Type: event.TypeBuildingPlaced, At: record.At, Player: id.Player(), Data: event.BuildingPlacedData{
			UserID: userID, CharacterGUID: guid, Name: id.Name, Building: building,
		}}}
	case modevents.TypeCraft:
		recipe := modevents.AssetName(modevents.FindString(params, "recipe", "data", "item"))
		if recipe == "" || record.PlayerName == "" {
			return []emission{c.modOther(record, id)}
		}
		data := event.ItemCraftedData{UserID: userID, CharacterGUID: guid, Name: id.Name, Recipe: recipe}
		if count, ok := modevents.FindNumber(params, "count", "amount", "quantity", "num"); ok && count >= 1 {
			data.Count = event.Int(int(count))
		}
		return []emission{{Type: event.TypeItemCrafted, At: record.At, Player: id.Player(), Data: data}}
	}
	return []emission{c.modOther(record, id)}
}

func truncate(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}
