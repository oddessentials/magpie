package saves

import (
	"reflect"
	"strings"
	"testing"

	"github.com/oddessentials/magpie/collector/internal/event"
)

func TestBasesClusterNearbyPiecesAndSumWhatUnfinishedPiecesNeed(t *testing.T) {
	base := strings.TrimSuffix(readerOutput, "}")
	raw := base + `,"buildings":[` +
		`{"data_id":"wall","unfinished":false,"position":{"x":1000,"y":1000,"z":10},"requirements":[{"item_id":"log","needed":4,"supplied":4}]},` +
		`{"data_id":"wall","unfinished":true,"position":{"x":6000,"y":1000,"z":30},"requirements":[{"item_id":"log","needed":4,"supplied":1},{"item_id":"stone","needed":2,"supplied":0}]},` +
		`{"data_id":"door","unfinished":true,"position":{"x":11000,"y":1000,"z":20},"requirements":[{"item_id":"log","needed":2,"supplied":0},{"item_id":"","needed":2,"supplied":0}]},` +
		`{"data_id":"totem","unfinished":false,"position":{"x":90000,"y":-40000,"z":0},"requirements":[]},` +
		`{"data_id":"ghost","unfinished":false,"position":null,"requirements":[]}]}`
	result, err := Decode([]byte(raw), 1)
	if err != nil {
		t.Fatal(err)
	}
	world := result.World
	want := []event.SavedBase{{X: 6000, Y: 1000, Z: 20, Pieces: 3, Unfinished: 2}, {X: 90000, Y: -40000, Z: 0, Pieces: 1}}
	if !reflect.DeepEqual(world.Bases, want) {
		t.Fatalf("bases %+v", world.Bases)
	}
	if !reflect.DeepEqual(world.Requirements, []event.SavedRequirement{{Item: "log", Missing: 5}, {Item: "stone", Missing: 2}}) {
		t.Fatalf("requirements %+v", world.Requirements)
	}
	empty, err := Decode([]byte(base+`,"buildings":[]}`), 1)
	if err != nil || empty.World.Bases == nil || len(empty.World.Bases) != 0 || empty.World.Requirements == nil {
		t.Fatalf("a world without buildings has empty bases: %+v", empty.World)
	}
}

func TestUnknownBuildingsLeaveBasesUnknown(t *testing.T) {
	result, err := Decode([]byte(readerOutput), 1)
	if err != nil {
		t.Fatal(err)
	}
	if result.World.Bases != nil || result.World.Requirements != nil {
		t.Fatalf("bases %+v requirements %+v", result.World.Bases, result.World.Requirements)
	}
}
