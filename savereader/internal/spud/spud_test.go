package spud_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/oddessentials/magpie/savereader/internal/spud"
	st "github.com/oddessentials/magpie/savereader/internal/spud/spudtest"
)

func field(name string, data []byte) st.Field {
	return st.Field{Name: name, Data: data}
}

func synthetic() st.Save {
	world := st.Level{
		Name: "L_World",
		Classes: []st.Class{
			{Name: "/Game/Weather/BP_WeatherActor.BP_WeatherActor_C", Props: []st.Prop{
				{Name: "WeathersJSONData", Type: spud.TypeString},
				{Name: "StoredTime", Type: spud.TypeFloat},
				{Name: "Ticks", Prefix: "LastEventStartTimespan", Type: spud.TypeInt64},
				{Name: "Definitions", Type: spud.TypeRecord},
				{Name: "bCanBeDamaged", Type: spud.TypeUInt8},
			}},
			{Name: "/Script/Dominion.RSAManager", Props: []st.Prop{{Name: "bCanBeDamaged", Type: spud.TypeUInt8}}},
		},
		Objects: []st.Object{
			{
				Class:      "/Game/Weather/BP_WeatherActor.BP_WeatherActor_C",
				Name:       "Wéather ☔",
				Components: []uint32{1},
				Core:       []byte{1, 2, 3},
				Custom:     []byte{9},
				Values: [][]byte{
					st.String(`{"Version":83}`),
					new(st.Buffer).F32(2671.5).Bytes(),
					new(st.Buffer).I64(1067770970112).Bytes(),
					st.Record(st.Entry(st.Str("Name", "one"))),
					{1},
				},
			},
			{Class: "/Script/Dominion.RSAManager", Name: "RSAManager_1", Values: [][]byte{{0}}},
		},
	}
	global := st.Level{
		Name:    "L_World",
		Classes: []st.Class{{Name: "/Script/Dominion.PersistenceSubsystem", Props: []st.Prop{{Name: "SaveFileRevision", Prefix: "WorldSaveSettings", Type: spud.TypeInt32}}}},
		Objects: []st.Object{{Class: "/Script/Dominion.PersistenceSubsystem", Name: "DomPersistence", Values: [][]byte{new(st.Buffer).I32(7).Bytes()}}},
	}
	return st.Save{
		SystemVersion: 8,
		Timestamp:     "2026-09-28T18:14:27.756Z",
		Fields: []st.Field{
			field("VERSION", new(st.Buffer).I32(9).Bytes()),
			field("WorldName", st.String("magpie-rig")),
			field("FriendlyFire", []byte{1}),
			field("TimeOfSave", new(st.Buffer).I64(639262160677440000).Bytes()),
			field("Note", st.String("ünïcode")),
		},
		CurrentLevel: "L_World",
		Global:       global,
		Levels:       []st.Level{world, {Name: "RSACell12800_X1_Y13"}},
	}
}

func TestParsesASyntheticSave(t *testing.T) {
	save, err := spud.Parse(synthetic().Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if save.SystemVersion != 8 || save.UE4Version != 522 || save.UE5Version != 1017 || save.Timestamp != "2026-09-28T18:14:27.756Z" || save.CurrentLevel != "L_World" {
		t.Fatalf("header %+v", save)
	}
	if v, ok := save.Info.Int32("VERSION"); !ok || v != 9 {
		t.Fatalf("VERSION %d %v", v, ok)
	}
	if name, ok := save.Info.String("WorldName"); !ok || name != "magpie-rig" {
		t.Fatalf("WorldName %q %v", name, ok)
	}
	if note, ok := save.Info.String("Note"); !ok || note != "ünïcode" {
		t.Fatalf("Note %q %v", note, ok)
	}
	if ff, ok := save.Info.Bool("FriendlyFire"); !ok || !ff {
		t.Fatalf("FriendlyFire %v %v", ff, ok)
	}
	if ticks, ok := save.Info.Int64("TimeOfSave"); !ok || ticks != 639262160677440000 {
		t.Fatalf("TimeOfSave %d %v", ticks, ok)
	}
	if _, ok := save.Info.String("SessionPasswd"); ok {
		t.Fatal("a missing field was found")
	}
	if _, ok := save.Info.Int32("WorldName"); ok {
		t.Fatal("a string read as an int")
	}
	if len(save.Global.Objects) != 1 || save.Global.Objects[0].Name != "DomPersistence" || save.Global.Objects[0].Class != "/Script/Dominion.PersistenceSubsystem" {
		t.Fatalf("global objects %+v", save.Global.Objects)
	}
	if _, ok := save.Global.Objects[0].Property("SaveFileRevision"); ok {
		t.Fatal("a nested property was found at the top level")
	}
	if len(save.Levels) != 2 || save.Levels[0].Name != "L_World" || save.Levels[1].Name != "RSACell12800_X1_Y13" || len(save.Levels[1].Objects) != 0 {
		t.Fatalf("levels %+v", save.Levels)
	}
	world := save.Levels[0]
	if world.Meta.Version != 5 || len(world.Meta.Classes) != 2 || len(world.Meta.Defs["/Script/Dominion.RSAManager"]) != 1 {
		t.Fatalf("meta %+v", world.Meta)
	}
	if len(world.Objects) != 2 || world.Objects[0].Name != "Wéather ☔" || string(world.Objects[0].Custom) != "\x09" {
		t.Fatalf("objects %+v", world.Objects)
	}
	weather := world.Objects[0]
	if text, err := mustProperty(t, &weather, "WeathersJSONData").String(); err != nil || text != `{"Version":83}` {
		t.Fatalf("WeathersJSONData %q %v", text, err)
	}
	if stored, err := mustProperty(t, &weather, "StoredTime").Float32(); err != nil || stored != 2671.5 {
		t.Fatalf("StoredTime %v %v", stored, err)
	}
	if _, err := mustProperty(t, &weather, "StoredTime").String(); err == nil {
		t.Fatal("a float read as a string")
	}
	entries, err := mustProperty(t, &weather, "Definitions").Record()
	if err != nil || len(entries) != 1 {
		t.Fatalf("Definitions %+v %v", entries, err)
	}
	if name, err := entries[0].String("Name"); err != nil || name != "one" {
		t.Fatalf("Name %q %v", name, err)
	}
	if v, ok := weather.Property("bCanBeDamaged"); !ok || v.Type != spud.TypeUInt8 || len(v.Data) != 1 || v.Data[0] != 1 {
		t.Fatalf("bCanBeDamaged %+v %v", v, ok)
	}
	if _, ok := weather.Property("Ticks"); ok {
		t.Fatal("a prefixed property was found by its bare name")
	}
	if v, ok := world.Objects[1].Property("bCanBeDamaged"); !ok || v.Data[0] != 0 {
		t.Fatalf("second object %+v %v", v, ok)
	}
}

func mustProperty(t *testing.T, object *spud.Object, name string) spud.Value {
	t.Helper()
	value, ok := object.Property(name)
	if !ok {
		t.Fatalf("%s has no %s", object.Name, name)
	}
	return value
}

func TestRejectsFilesThatAreNotCompleteSaves(t *testing.T) {
	data := synthetic().Bytes()
	if _, err := spud.Parse(data[:len(data)/2]); !errors.Is(err, spud.ErrIncomplete) {
		t.Fatalf("truncated: %v", err)
	}
	if _, err := spud.Parse(data[:6]); !errors.Is(err, spud.ErrIncomplete) && err == nil {
		t.Fatalf("header only: %v", err)
	}
	if _, err := spud.Parse(append(append([]byte{}, data...), 0)); err == nil || !strings.Contains(err.Error(), "follow the save") {
		t.Fatalf("trailing: %v", err)
	}
	if _, err := spud.Parse([]byte("GVAS\x00\x00\x00\x00")); err == nil || !strings.Contains(err.Error(), "not a SPUD save") {
		t.Fatalf("gvas: %v", err)
	}
	if _, err := spud.Parse(nil); err == nil {
		t.Fatal("empty parsed")
	}
	broken := append([]byte{}, data...)
	copy(broken[8:12], "info")
	if _, err := spud.Parse(broken); err == nil || !strings.Contains(err.Error(), "not a chunk tag") {
		t.Fatalf("bad tag: %v", err)
	}
	empty := st.Chunk("SAVE", st.Chunk("GLOB", st.String("L_World")))
	if _, err := spud.Parse(empty); err == nil || !strings.Contains(err.Error(), "INFO") {
		t.Fatalf("no info: %v", err)
	}
}

func TestPropertyBoundsAreChecked(t *testing.T) {
	save := synthetic()
	save.Levels[0].Objects[0].Values = save.Levels[0].Objects[0].Values[:1]
	parsed, err := spud.Parse(save.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	object := parsed.Levels[0].Objects[0]
	if _, ok := object.Property("WeathersJSONData"); !ok {
		t.Fatal("the stored property is missing")
	}
	if _, ok := object.Property("StoredTime"); ok {
		t.Fatal("a property without data was found")
	}
}
