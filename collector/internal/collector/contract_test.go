package collector

import (
	"bufio"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/oddessentials/magpie/collector/internal/config"
	"github.com/oddessentials/magpie/collector/internal/contract"
	"github.com/oddessentials/magpie/collector/internal/dragonwilds"
	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/ingest"
	"github.com/oddessentials/magpie/collector/internal/modevents"
	"github.com/oddessentials/magpie/collector/internal/saves"
	"github.com/oddessentials/magpie/collector/internal/serverlog"
)

const readerOutput = `{"format":1,"saved_at":"2026-09-28T19:41:02.294Z","system_version":8,"world":{"version":9,"guid":"1234567890abcdef1234567890abcdef","name":"Test World","map":"L_World","friendly_fire":false,"survival_difficulty":0,"hardcore_state":1,"session_privacy":3,"crossplay":true,"owner_id":"","owner_name":"","last_saved_by":"++dominion+hotfix:244954","revision":13},"weather":[{"region":"base","type":"EWeatherType::Cloudy","alt_profile":false,"day_count":2,"remaining_time":769.166}],"events":[{"name":"base_raid_bm_1","triggers":[{"name":"cooldown","value":true,"time":"+4.03:29:59.998"}]}],"characters":[{"guid":"ABCDEF0123456789ABCDEF0123456789","intact":true,"name":"Wanderer","type":0,"version":3,"save_count":5,"hardcore":false,"worlds_playtime":{"1234567890ABCDEF1234567890ABCDEF":3600.5},"playtime_sim":3500,"playtime_wall":3600.5,"health":80,"stamina":100,"skills":[{"id":"4pefO9k1lUqfA6mvHNi1SA","xp":150}],"quests":[{"id":"quest-1","state":2,"objective":"talk"}],"journal":{"unlocked":40,"unread":3},"spells_selected":1,"position":{"x":1,"y":2,"z":3}}]}`

const modLines = `{"ChatMessageData":{"MessageBody":"hello there","SenderData":{"PlayerId":256}},"ChatPlayerFilterData":{"ReceiverIds":"[0]"},"hook":"/Script/JagexChatBackend.PlayerChatComponent:Server_SendChatMessage","player_name":"Wanderer","platform":{"PlatformName":"Steam"},"self":"PlayerChatComponent /Game/X","ts":"2026-09-28T22:41:29Z","type":"chat","v":1}
{"ChatPlayerEventData":{"EventTag":"Chat.Event.PlayerJoined","SenderData":{"PlayerId":256}},"hook":"/Script/JagexChatBackend.PlayerChatComponent:Server_SendPlayerEvent","player_name":"Wanderer","self":"PlayerChatComponent /Game/X","ts":"2026-09-28T22:41:10Z","type":"player_event","v":1}
{"DeathTelemetry":{"DeathCause":"Fall","KillerName":"Goblin","Location":{"X":1.5,"Y":2.5,"Z":3.5}},"hook":"/Script/Dominion.DominionPlayerCharacter:Client_SendDeathEventTelemetry","player_name":"Wanderer","self":"DominionPlayerCharacter /Game/X","ts":"2026-09-28T22:42:12Z","type":"death","v":1}
{"RespawnLocation":{"X":10,"Y":20,"Z":30},"hook":"/Script/Dominion.PlayerRespawnComponent:Multicast_Respawn","player_name":"Wanderer","self":"PlayerRespawnComponent /Game/X","ts":"2026-09-28T22:42:20Z","type":"respawn","v":1}
{"KickReason":"afk","hook":"/Script/Engine.PlayerController:ClientWasKicked","player_name":"Wanderer","self":"PlayerController /Game/X","ts":"2026-09-28T22:43:00Z","type":"kicked","v":1}
{"Action":"Kick","TargetName":"Rover","hook":"/Script/Dominion.DominionPlayerController:Server_RequestAdminAction","player_name":"Wanderer","self":"DominionPlayerController /Game/X","ts":"2026-09-28T22:43:10Z","type":"admin_action","v":1}
{"NewLevel":12,"SkillData":"SkillData /Game/Gameplay/Character/Player/Skills/SKILL_Attack.SKILL_Attack","hook":"/Script/Dominion.DominionPlayerCharacter:NetMulticast_OnPlayerSkillLevelIncreased","player_name":"Wanderer","self":"DominionPlayerCharacter /Game/X","ts":"2026-09-28T22:44:00Z","type":"skill_level","v":1}
{"NewXp":1234.5,"XpDelta":33,"Skill":"SkillData /Game/Gameplay/Character/Player/Skills/SKILL_Mining.SKILL_Mining","hook":"/Script/Dominion.SkillComponent:BP_OnSkillXPChanged","player_name":"Wanderer","self":"SkillComponent /Game/X","ts":"2026-09-28T22:44:05Z","type":"xp_changed","v":1}
{"QuestData":"QuestData /Game/Gameplay/Quests/Quest_DogDays.Quest_DogDays","QuestState":"InProgress","CurrentObjective":"FindTheDog","hook":"/Script/Dominion.QuestProgressComponent:Client_OnQuestUpdated","player_name":"Wanderer","self":"QuestProgressComponent /Game/X","ts":"2026-09-28T22:45:00Z","type":"quest","v":1}
{"QuestData":"QuestData /Game/Gameplay/Quests/Quest_DogDays.Quest_DogDays","hook":"/Script/Dominion.QuestProgressComponent:CompleteQuest","player_name":"Wanderer","self":"QuestProgressComponent /Game/X","ts":"2026-09-28T22:46:00Z","type":"quest_complete","v":1}
{"BuildingData":"/Game/Gameplay/Building/BP_WoodWall.BP_WoodWall_C","hook":"/Script/Dominion.BuildModeComponent:Server_SpawnBuilding","player_name":"Wanderer","self":"BuildModeComponent /Game/X","ts":"2026-09-28T22:47:00Z","type":"build","v":1}
{"RecipeData":"RecipeData /Game/Gameplay/Recipes/Recipe_Rope.Recipe_Rope","Count":2,"hook":"/Script/Dominion.InventoryController:Server_CraftRecipe","player_name":"Wanderer","self":"InventoryController /Game/X","ts":"2026-09-28T22:48:00Z","type":"craft","v":1}
{"bIsInBaseRaid":true,"hook":"/Script/Dominion.DominionPlayerController:Client_SetIsInBaseRaid","player_name":"Wanderer","self":"DominionPlayerController /Game/X","ts":"2026-09-28T22:49:00Z","type":"base_raid","v":1}
{"file":"D:\\rig\\magpie-stop.txt","ts":"2026-09-28T23:36:04Z","type":"stop_requested","v":1}
{"SlotName":"Test World","bSuccess":true,"hook":"/Script/Dominion.PersistenceSubsystem:PostSaveWorldState","self":"PersistenceSubsystem /Engine/Transient.X","ts":"2026-09-28T23:36:04Z","type":"save_done","v":1}
{"ts":"2026-09-28T23:36:05Z","type":"quit","v":1}`

func sessionEmissions(t *testing.T, mapper *dragonwilds.Mapper) []dragonwilds.Emission {
	t.Helper()
	file, err := os.Open(filepath.Join("..", "dragonwilds", "testdata", "session.txt"))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	var out []dragonwilds.Emission
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		record, ok := serverlog.Parse(scanner.Text())
		if !ok {
			continue
		}
		at, ok := serverlog.ParseTimestamp(record.Timestamp)
		if !ok {
			at = time.Date(2026, 9, 28, 21, 0, 0, 0, time.UTC)
		}
		out = append(out, mapper.Map(record, at)...)
	}
	return out
}

func primedCollector(t *testing.T) *Collector {
	t.Helper()
	c := &Collector{mapper: dragonwilds.NewMapper(), cfg: &config.Config{}, serverUp: true}
	at := time.Date(2026, 9, 28, 22, 0, 0, 0, time.UTC)
	c.mapper.Map(serverlog.Record{Category: "LogNet", Message: "Login request: ?p=x?pf=PC?cpx=1?c?Name=Wanderer userId: RedpointEOS:00000000000000000000000000000abc platform: RedpointEOS"}, at)
	c.mapper.Map(serverlog.Record{Category: "LogDominionPlayerControllerBase", Message: "PlayerChar entered world [Account[XP:00000000000000000000000000000abc] Character Name[Wanderer] Guid[DCG:ABCDEF0123456789ABCDEF0123456789] Type[0]]"}, at)
	return c
}

func modEmissions(t *testing.T, c *Collector) []emission {
	t.Helper()
	var out []emission
	for _, line := range strings.Split(strings.TrimSpace(modLines), "\n") {
		record, err := modevents.Parse(line, time.Date(2026, 9, 28, 22, 0, 0, 0, time.UTC))
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, c.modEmissions(record)...)
	}
	return out
}

func TestEveryEmittedTypeMatchesTheContract(t *testing.T) {
	path, err := contract.Find()
	if err != nil {
		t.Skipf("no contract to check against: %v (set %s or add web/openapi.yaml)", err, contract.PathEnv)
	}
	validator, err := contract.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 28, 22, 19, 11, 0, time.UTC)
	var items []emission
	mapper := dragonwilds.NewMapper()
	for _, item := range sessionEmissions(t, mapper) {
		if item.Type == dragonwilds.TypeWorldLoaded {
			continue
		}
		items = append(items, emission{item.Type, item.At, item.Player, item.Data})
	}
	c := primedCollector(t)
	c.stopping = true
	c.stopBy = stopByCollector
	items = append(items, modEmissions(t, c)...)
	result, err := saves.Decode([]byte(readerOutput), 487351)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range saves.NewTracker().Changes(result) {
		items = append(items, emission{Type: item.Type, At: at, Data: item.Data})
	}
	info := event.ServerInfo{Name: "Test Server", Build: event.String("++dominion+hotfix-CL-244954"), WorldName: "Test World", WorldGUID: event.String("1234567890ABCDEF1234567890ABCDEF"), MaxPlayers: event.Int(6)}
	settings := &event.ServerSettings{MaxPlayers: event.Int(6), PlatformPolicy: event.String("Crossplay"), SaveFrequencyMin: event.Int(5)}
	items = append(items,
		emission{Type: event.TypeCollectorStarted, At: at, Data: event.CollectorStartedData{CollectorVersion: "0.1.0", OS: "linux", Arch: "amd64", Layers: event.CollectorLayers{Logs: true, LogsSource: event.String("remote"), Saves: true, Remote: &event.RemoteObservation{LogsPollS: event.Float(5), SavesPollS: event.Float(30)}}}},
		emission{Type: event.TypeCollectorHeartbeat, At: at, Data: event.CollectorHeartbeatData{Logs: stateOK, Saves: stateOK, Process: stateOff, Mod: stateOff, Remote: &event.RemoteObservation{LogsPollS: event.Float(5), SavesPollS: event.Float(30), LogsCheckedAt: &at, SavesCheckedAt: &at}}},
		emission{Type: event.TypeCollectorStarted, At: at, Data: event.CollectorStartedData{CollectorVersion: "0.1.0", OS: "linux", Arch: "amd64", Layers: event.CollectorLayers{Logs: true, LogsSource: event.String("launch"), Saves: true, Process: true, Mod: true}, Server: &info, Settings: settings}},
		emission{Type: event.TypeCollectorStarted, At: at, Data: event.CollectorStartedData{CollectorVersion: "0.1.0", OS: "linux", Arch: "amd64", Layers: event.CollectorLayers{}}},
		emission{Type: event.TypeCollectorHeartbeat, At: at, Data: event.CollectorHeartbeatData{UptimeS: 60.5, QueueDepth: 3, Logs: stateError, Saves: stateWaiting, Process: stateOff, Mod: stateOff}},
		emission{Type: event.TypeCollectorHeartbeat, At: at, Data: event.CollectorHeartbeatData{UptimeS: 360, Logs: stateOK, Saves: stateOK, Process: stateOK, Mod: stateOK}},
		emission{Type: event.TypeServerOnline, At: at, Data: event.ServerOnlineData{ServerInfo: info, Settings: settings}},
		emission{Type: event.TypeServerOnline, At: at, Data: event.ServerOnlineData{ServerInfo: event.ServerInfo{Name: "x", WorldName: "y"}}},
		emission{Type: event.TypeServerStopping, At: at, Data: event.ServerStoppingData{By: event.String(stopByCollector), Save: event.String(event.SaveRequested)}},
		emission{Type: event.TypeServerStopping, At: at, Data: event.ServerStoppingData{}},
		emission{Type: event.TypeServerOffline, At: at, Data: event.ServerOfflineData{Reason: event.OfflineCrashed}},
		emission{Type: event.TypeServerOffline, At: at, Data: event.ServerOfflineData{Reason: event.OfflineCollectorStopping}},
		emission{Type: event.TypeServerMetrics, At: at, Data: event.ServerMetricsData{MemoryMB: 1046.5, UptimeS: 120, Players: 1, MaxPlayers: event.Int(6)}},
		emission{Type: event.TypeServerMetrics, At: at, Data: event.ServerMetricsData{}},
		actionEmission(actionResult{Action: ingest.Action{ID: 1, Kind: "announce"}}, at),
		actionEmission(actionResult{Action: ingest.Action{ID: 2, Kind: "save"}, Err: errors.New("not supported")}, at),
	)
	factory := event.NewFactory(event.NewUUID())
	seen := map[string]bool{}
	other := 0
	for _, item := range items {
		created, err := factory.NewFor(item.Type, item.At, item.Player, item.Data)
		if err != nil {
			t.Fatal(err)
		}
		raw, err := created.Marshal()
		if err != nil {
			t.Fatal(err)
		}
		if err := validator.ValidateEvent(raw); err != nil {
			t.Errorf("%v\n%s", err, raw)
		}
		if contract.EventSchema(item.Type) == "OtherEvent" {
			other++
		}
		seen[item.Type] = true
	}
	var missing []string
	for _, eventType := range contract.DocumentedTypes() {
		if !seen[eventType] {
			missing = append(missing, eventType)
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Fatalf("no example for %s", strings.Join(missing, ", "))
	}
	if other == 0 {
		t.Fatal("no example of an undocumented type")
	}
	for _, eventType := range validator.ContractTypes() {
		if contract.EventSchema(eventType) == "OtherEvent" {
			t.Errorf("the contract documents %s but the collector maps it to OtherEvent", eventType)
		}
	}
}

func TestStopAttributionAndAFailedSaveOutsideLaunchMode(t *testing.T) {
	c := primedCollector(t)
	c.cfg.Logs.Source = config.SourceFile
	at := time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC)
	emit := func(line string) []emission {
		t.Helper()
		record, err := modevents.Parse(line, at)
		if err != nil {
			t.Fatal(err)
		}
		return c.modEmissions(record)
	}
	stopping := func(items []emission) event.ServerStoppingData {
		t.Helper()
		if len(items) != 1 || items[0].Type != event.TypeServerStopping {
			t.Fatalf("items %+v", items)
		}
		return items[0].Data.(event.ServerStoppingData)
	}
	requested := stopping(emit(`{"file":"x","by":"admin","ts":"2026-09-29T12:00:00Z","type":"stop_requested","v":1}`))
	if *requested.By != stopByAdmin || *requested.Save != event.SaveRequested {
		t.Fatalf("requested %+v", requested)
	}
	failed := stopping(emit(`{"SlotName":"W","bSuccess":false,"hook":"/Script/Dominion.PersistenceSubsystem:PostSaveWorldState","self":"x","ts":"2026-09-29T12:00:05Z","type":"save_done","v":1}`))
	if *failed.By != stopByAdmin || *failed.Save != event.SaveFailed {
		t.Fatalf("failed %+v", failed)
	}
	if active, _ := c.stopState(); active {
		t.Fatal("a failed save outside launch mode ends the stop")
	}
	again := stopping(emit(`{"file":"x","by":"collector","ts":"2026-09-29T12:01:00Z","type":"stop_requested","v":1}`))
	if *again.By != stopByCollector {
		t.Fatalf("a new request is announced with its own requester: %+v", again)
	}
	c.resetStop()
	unknown := stopping(emit(`{"file":"x","by":"stop","ts":"2026-09-29T12:02:00Z","type":"stop_requested","v":1}`))
	if *unknown.By != stopByUnknown {
		t.Fatalf("an unrecognised requester is unknown: %+v", unknown)
	}
}

func TestModEventsBecomeContractEvents(t *testing.T) {
	c := primedCollector(t)
	c.stopping = true
	c.stopBy = stopByCollector
	items := modEmissions(t, c)
	kinds := make([]string, 0, len(items))
	for _, item := range items {
		kinds = append(kinds, item.Type)
	}
	want := "chat.message player.event player.died player.respawned player.kicked admin.action skill.level_up player.xp quest.updated quest.updated building.placed item.crafted mod.base_raid server.stopping server.stopping mod.quit"
	if got := strings.Join(kinds, " "); got != want {
		t.Fatalf("got %s", got)
	}
	chat := items[0].Data.(event.ChatMessageData)
	if *chat.UserID != "00000000000000000000000000000abc" || *chat.CharacterGUID != "ABCDEF0123456789ABCDEF0123456789" || chat.Text != "hello there" || chat.Channel != "global" || *chat.Recipients != 0 {
		t.Fatalf("chat %+v", chat)
	}
	if items[0].Player == nil || items[0].Player.Name != "Wanderer" || *items[0].Player.Platform != "pc" {
		t.Fatalf("the log's platform wins over the mod's: %+v", items[0].Player)
	}
	died := items[2].Data.(event.PlayerDiedData)
	if *died.Cause != "Fall" || *died.Killer != "Goblin" || *died.X != 1.5 || died.Source != "mod" || died.Params == nil {
		t.Fatalf("died %+v", died)
	}
	level := items[6].Data.(event.SkillLevelUpData)
	if level.Skill != "SKILL_Attack" || level.Level != 12 {
		t.Fatalf("level %+v", level)
	}
	xp := items[7].Data.(event.PlayerXpData)
	if xp.Skill != "SKILL_Mining" || xp.XP != 1234.5 || *xp.Delta != 33 {
		t.Fatalf("xp %+v", xp)
	}
	completed := items[9].Data.(event.QuestUpdatedData)
	if completed.Quest != "Quest_DogDays" || completed.State != "completed" {
		t.Fatalf("completed %+v", completed)
	}
	built := items[10].Data.(event.BuildingPlacedData)
	if built.Building != "BP_WoodWall" {
		t.Fatalf("built %+v", built)
	}
	crafted := items[11].Data.(event.ItemCraftedData)
	if crafted.Recipe != "Recipe_Rope" || *crafted.Count != 2 {
		t.Fatalf("crafted %+v", crafted)
	}
	raid := items[12].Data.(map[string]any)
	if raid["bIsInBaseRaid"] != true || items[12].Player == nil {
		t.Fatalf("raid %+v", raid)
	}
	stopping := items[13].Data.(event.ServerStoppingData)
	done := items[14].Data.(event.ServerStoppingData)
	if *stopping.Save != event.SaveRequested || *done.Save != event.SaveDone || *done.By != stopByCollector {
		t.Fatalf("stopping %+v %+v", stopping, done)
	}
}
