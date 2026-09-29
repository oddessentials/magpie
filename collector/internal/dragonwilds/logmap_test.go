package dragonwilds

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/oddessentials/magpie/collector/internal/event"
	"github.com/oddessentials/magpie/collector/internal/serverlog"
)

const (
	userID   = "00000000000000000000000000000abc"
	playerID = "ABCDEF0123456789ABCDEF0123456789"
)

func mapFile(t *testing.T, mapper *Mapper, path string) []Emission {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	var out []Emission
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	received := time.Date(2026, 9, 28, 21, 0, 0, 0, time.UTC)
	for scanner.Scan() {
		record, ok := serverlog.Parse(serverlog.Clean(scanner.Text()))
		if !ok {
			continue
		}
		at, ok := serverlog.ParseTimestamp(record.Timestamp)
		if !ok {
			at = received
		}
		out = append(out, mapper.Map(record, at)...)
	}
	return out
}

func types(items []Emission) string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		names = append(names, item.Type)
	}
	return strings.Join(names, " ")
}

func encode(t *testing.T, value any) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestSessionLogBecomesEvents(t *testing.T) {
	mapper := NewMapper()
	items := mapFile(t, mapper, filepath.Join("testdata", "session.txt"))
	want := "world.loaded server.saved player.joined journal.unlocked player.died player.respawned log.other player.left log.other player.joined player.kicked player.left"
	if got := types(items); got != want {
		t.Fatalf("got %s", got)
	}
	loaded := items[0].Data.(WorldLoaded)
	if loaded.GUID != "1234567890ABCDEF1234567890ABCDEF" || loaded.Name != "Test World" || loaded.Slot != "Test World" {
		t.Fatalf("loaded %+v", loaded)
	}
	state := mapper.Server()
	if state.Build != "++dominion+hotfix-CL-244954" || state.MaxPlayers != 6 || !state.Exiting {
		t.Fatalf("state %+v", state)
	}
	saved := items[1].Data.(event.ServerSavedData)
	if *saved.Slot != "Test World" || !saved.OK {
		t.Fatalf("saved %+v", saved)
	}
	joined := items[2].Data.(event.PlayerJoinedData)
	if joined.UserID != userID || *joined.CharacterGUID != playerID || joined.Name != "Wanderer" || *joined.Platform != "pc" || joined.Source != "log" {
		t.Fatalf("joined %+v", joined)
	}
	if items[2].Player == nil || items[2].Player.Name != "Wanderer" || *items[2].Player.Platform != "pc" {
		t.Fatalf("player %+v", items[2].Player)
	}
	if !items[2].At.Equal(time.Date(2026, 9, 28, 21, 57, 53, 701000000, time.UTC)) {
		t.Fatalf("at %v", items[2].At)
	}
	journal := items[3].Data.(event.JournalUnlockedData)
	if journal.Entry != "JOURNAL_Know_People_Doric" || *journal.UserID != userID || *journal.Name != "Wanderer" {
		t.Fatalf("journal %+v", journal)
	}
	died := items[4].Data.(event.PlayerDiedData)
	if *died.UserID != userID || died.Name != "Wanderer" || *died.X != 8233.643 || *died.Z != -1276.647 || died.Source != "log" {
		t.Fatalf("died %+v", died)
	}
	respawned := items[5].Data.(event.PlayerRespawnedData)
	if respawned.Name != "Wanderer" || *respawned.X != 100.5 || *respawned.Y != 200.5 {
		t.Fatalf("the respawn takes the teleport that follows the gravestone: %+v", respawned)
	}
	other := items[6].Data.(event.LogOtherData)
	if other.Category != "LogDomMatcherSession" || *other.Level != "Error" || other.Message != "Something went wrong for [address] with account [id] and code [join code]" {
		t.Fatalf("other %+v", other)
	}
	left := items[7].Data.(event.PlayerLeftData)
	if left.UserID != userID || *left.CharacterGUID != playerID || left.Saved == nil || !*left.Saved {
		t.Fatalf("left %+v", left)
	}
	refused := items[8].Data.(event.LogOtherData)
	if refused.Category != "LogNet" || refused.Message != "PreLogin failure: PLogPassword" {
		t.Fatalf("refused %+v", refused)
	}
	rover := items[9].Data.(event.PlayerJoinedData)
	if rover.Name != "Rover" || *rover.Platform != "xsx" {
		t.Fatalf("rover %+v", rover)
	}
	kicked := items[10].Data.(event.PlayerKickedData)
	if *kicked.Name != "Rover" || *kicked.UserID != "00000000000000000000000000000def" {
		t.Fatalf("kicked %+v", kicked)
	}
	gone := items[11].Data.(event.PlayerLeftData)
	if gone.Name != "Rover" || gone.Saved != nil {
		t.Fatalf("a removal without a menu leave has no saved flag: %+v", gone)
	}
	if online := mapper.Online(); len(online) != 0 {
		t.Fatalf("everyone left: %+v", online)
	}
	for _, item := range items {
		raw := encode(t, item.Data)
		for _, secret := range []string{"hunter2", "aHVudGVyMg==", "d3Jvbmc=", "ABCD-EF12", "192.0.2.10"} {
			if strings.Contains(raw, secret) {
				t.Fatalf("%s carries %q: %s", item.Type, secret, raw)
			}
		}
	}
}

func TestDeathsNeedOnePlayerOnline(t *testing.T) {
	mapper := NewMapper()
	at := time.Date(2026, 9, 28, 22, 0, 0, 0, time.UTC)
	grave := serverlog.Record{Category: "LogSpawn", Level: "Warning", Message: "SpawnActor failed to find teleport spot [X=1 Y=2 Z=3] for [BP_PlayerGravestone_C]"}
	if items := mapper.Map(grave, at); len(items) != 0 {
		t.Fatalf("nobody online: %s", types(items))
	}
	mapper.Map(serverlog.Record{Category: "LogDominionPlayerControllerBase", Message: "PlayerChar entered world [Account[XP:" + userID + "] Character Name[Wanderer] Guid[DCG:" + playerID + "] Type[0]]"}, at)
	mapper.Map(serverlog.Record{Category: "LogDominionPlayerControllerBase", Message: "PlayerChar entered world [Account[XP:00000000000000000000000000000def] Character Name[Rover] Guid[DCG:0123456789ABCDEF0123456789ABCDEF] Type[0]]"}, at)
	if items := mapper.Map(grave, at); len(items) != 0 {
		t.Fatalf("two online, no attribution: %s", types(items))
	}
	journal := mapper.Map(serverlog.Record{Category: "LogJournal", Level: "Verbose", Message: `[DedicatedServer] UnlockJournalEntriesByPredicate() : Unlocking Journal Entry "JOURNAL_World_Fauna_Chicken"`}, at)
	data := journal[0].Data.(event.JournalUnlockedData)
	if data.UserID != nil || data.Name != nil || data.Entry != "JOURNAL_World_Fauna_Chicken" || journal[0].Player != nil {
		t.Fatalf("journal with two online carries no player: %+v", data)
	}
	if id, ok := mapper.Identify("Rover"); !ok || id.UserID != "00000000000000000000000000000def" || id.CharacterGUID != "0123456789ABCDEF0123456789ABCDEF" {
		t.Fatalf("identify %+v %v", id, ok)
	}
	if _, ok := mapper.Identify("Nobody"); ok {
		t.Fatal("unknown names are not identified")
	}
}

func TestLoginNamesWithSpacesKeepTheirPlatform(t *testing.T) {
	mapper := NewMapper()
	at := time.Date(2026, 9, 28, 22, 0, 0, 0, time.UTC)
	mapper.Map(serverlog.Record{Category: "LogNet", Message: "Login request: ?p=x?pf=PC?cpx=1?c?Name=Magpie Fixture userId: RedpointEOS:00000000000000000000000000000017 platform: RedpointEOS"}, at)
	items := mapper.Map(serverlog.Record{Category: "LogDominionPlayerControllerBase", Message: "PlayerChar entered world [Account[XP:00000000000000000000000000000017] Character Name[Magpie Fixture] Guid[DCG:0123456789ABCDEF0123456789ABCDEF] Type[0]]"}, at)
	if len(items) != 1 {
		t.Fatalf("items %s", types(items))
	}
	joined := items[0].Data.(event.PlayerJoinedData)
	if joined.Name != "Magpie Fixture" || joined.Platform == nil || *joined.Platform != "pc" {
		t.Fatalf("joined %+v", joined)
	}
}

func TestErrorsAreRateLimited(t *testing.T) {
	mapper := NewMapper()
	at := time.Date(2026, 9, 28, 22, 0, 0, 0, time.UTC)
	count := 0
	for i := 0; i < 40; i++ {
		count += len(mapper.Map(serverlog.Record{Category: "LogTest", Level: "Error", Message: "boom"}, at.Add(time.Duration(i)*time.Second)))
	}
	if count != otherPerMinute {
		t.Fatalf("%d errors passed in one minute", count)
	}
	if len(mapper.Map(serverlog.Record{Category: "LogTest", Level: "Error", Message: "boom"}, at.Add(2*time.Minute))) != 1 {
		t.Fatal("the next minute opens again")
	}
}

func TestRedaction(t *testing.T) {
	line := `Login request: ?p=aHVudGVyMg==?pf=PC?c?Name=Wanderer userId: RedpointEOS:00000000000000000000000000000abc from 192.0.2.10:63822 and [2001:db8::1]:7777 code ABCD-EF12 Password[hunter2] WorldPassword: hunter2`
	got := Line(line)
	want := `Login request: ?p=[password]?pf=PC?c?Name=Wanderer userId: RedpointEOS:[id] from [address] and [address] code [join code] Password[[password]] WorldPassword: [password]`
	if got != want {
		t.Fatalf("got %s", got)
	}
	if Secrets("no secrets here 2026-09-28") != "no secrets here 2026-09-28" {
		t.Fatal("dates survive")
	}
}

var hexShape = regexp.MustCompile(`[0-9a-fA-F]{32}`)

func TestRigGoldenSessionKeepsSecretsOut(t *testing.T) {
	rig := os.Getenv("MAGPIE_RIG")
	if rig == "" {
		t.Skip("MAGPIE_RIG is not set")
	}
	path := filepath.Join(rig, "sessions", "golden-session-2", "Saved", "Logs", "RSDragonwilds.log")
	if _, err := os.Stat(path); err != nil {
		t.Skip(err)
	}
	mapper := NewMapper()
	items := mapFile(t, mapper, path)
	if len(items) == 0 {
		t.Fatal("no events from the golden session")
	}
	seen := map[string]int{}
	allowed := map[string]bool{"user_id": true, "character_guid": true, "world_guid": true, "character_guids": true, "GUID": true}
	joinCode := regexp.MustCompile(`\b[A-Z0-9]{4}-[A-Z0-9]{4}\b`)
	address := regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}\b`)
	for _, item := range items {
		seen[item.Type]++
		raw := encode(t, item.Data)
		var decoded map[string]any
		if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
			t.Fatal(err)
		}
		walk(t, item.Type, "", decoded, func(key, value string) {
			if strings.Contains(value, "?p=") && !strings.Contains(value, "?p=[password]") {
				t.Errorf("%s %s carries a login password: %s", item.Type, key, value)
			}
			if strings.Contains(value, "bWFncGll") || strings.Contains(value, "WorldPassword: m") {
				t.Errorf("%s %s carries the world password: %s", item.Type, key, value)
			}
			if joinCode.MatchString(value) {
				t.Errorf("%s %s carries a join code: %s", item.Type, key, value)
			}
			if address.MatchString(value) {
				t.Errorf("%s %s carries an address: %s", item.Type, key, value)
			}
			if hexShape.MatchString(value) && !allowed[key] {
				t.Errorf("%s %s carries an id outside the contract's id fields: %s", item.Type, key, value)
			}
		})
	}
	for _, required := range []string{TypeWorldLoaded, event.TypeServerSaved, event.TypePlayerJoined, event.TypeJournalUnlocked, event.TypePlayerDied, event.TypePlayerLeft} {
		if seen[required] == 0 {
			t.Errorf("the golden session produced no %s", required)
		}
	}
}

func walk(t *testing.T, kind, key string, value any, visit func(key, value string)) {
	switch typed := value.(type) {
	case map[string]any:
		for k, v := range typed {
			walk(t, kind, k, v, visit)
		}
	case []any:
		for _, v := range typed {
			walk(t, kind, key, v, visit)
		}
	case string:
		visit(key, typed)
	}
}
