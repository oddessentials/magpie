package dragonwilds_test

import (
	"encoding/json"
	"math"
	"strings"
	"testing"

	"github.com/oddessentials/magpie/savereader/internal/dragonwilds"
	"github.com/oddessentials/magpie/savereader/internal/spud"
	st "github.com/oddessentials/magpie/savereader/internal/spud/spudtest"
)

const progressClass = "/Script/Dominion.WorldProgressManager"
const buildingsClass = "/Script/Dominion.GlobalBuildingManager"

func progressSave(values [][]byte, custom []byte) []byte {
	s := st.Save{SystemVersion: 8, Timestamp: savedAt.Format("2006-01-02T15:04:05.000Z"), Fields: headerFields(savedAt), CurrentLevel: "L_World", Levels: []st.Level{{Name: "L_World", Classes: []st.Class{{Name: progressClass, Props: []st.Prop{{Name: "WorldHooksTriggered", Type: spud.TypeRecord}, {Name: "DefeatedBossesInternalNames", Type: spud.TypeRecord}, {Name: "TaggedWorldProgressValues", Type: spud.TypeRecord}}}, {Name: buildingsClass}}, Objects: []st.Object{{Class: progressClass, Name: "progress", Values: values}, {Class: buildingsClass, Name: "buildings", Custom: custom}}}}}
	return s.Bytes()
}

func completeSet(values ...string) []byte { return new(st.Buffer).U32(0).Strings(values).Bytes() }
func progressValues(value float32) [][]byte {
	tags := new(st.Buffer).U32(0).U32(1).Raw(st.Entry(st.Str("TagName", "World.Progress.Test"))).F32(value).Bytes()
	return [][]byte{completeSet("/Game/WorldHooks/Example.Example"), completeSet("future_boss", "ai_boss_velgar"), tags}
}

func buildingPiece(id uint32, ghosted byte) []byte {
	return new(st.Buffer).U32(id).String("future-piece").F64(100).F64(-200).F64(3.5).F32(90).F32(1).F32(0.75).Strings([]string{"material-a", "material-b"}).U32(4).U32(2).U32(4).U32(1).U32(0).U8(ghosted).Bytes()
}

func buildingCustom(body []byte) []byte {
	return new(st.Buffer).U8(0).Chunk("Pces", body).Chunk("Plts", []byte{6}).Chunk("Tree", []byte{2, 1, 0, 0, 0}).Bytes()
}

func TestWorldProgressAndBuildings(t *testing.T) {
	world, err := dragonwilds.Decode(progressSave(progressValues(2.5), buildingCustom(append(buildingPiece(1, 0), buildingPiece(2, 1)...))))
	if err != nil {
		t.Fatal(err)
	}
	if world.Progress == nil || strings.Join(world.Progress.DefeatedBosses, ",") != "ai_boss_velgar,future_boss" || world.Progress.Values[0].Value != 2.5 || len(world.Progress.WorldHooks) != 1 {
		t.Fatalf("progress %+v", world.Progress)
	}
	if len(world.Buildings) != 2 || world.Buildings[0].Position.Y != -200 || world.Buildings[0].HealthFraction != 0.75 || world.Buildings[0].Unfinished || !world.Buildings[1].Unfinished {
		t.Fatalf("buildings %+v", world.Buildings)
	}
	if r := world.Buildings[1].Requirements; len(r) != 2 || r[1].Needed != 2 || r[1].Supplied != 1 {
		t.Fatalf("requirements %+v", r)
	}
	raw, _ := json.Marshal(world)
	if strings.Contains(string(raw), "time_of_day") {
		t.Fatal("StoredTime has not been verified as an hour")
	}
}

func TestMissingAndEmptyBuildingsRemainDifferent(t *testing.T) {
	values := [][]byte{completeSet(), completeSet(), completeSet()}
	unknown, err := dragonwilds.Decode(progressSave(values, nil))
	if err != nil || unknown.Buildings != nil {
		t.Fatalf("missing %v %v", unknown, err)
	}
	empty, err := dragonwilds.Decode(progressSave(values, buildingCustom(nil)))
	if err != nil || empty.Buildings == nil || len(empty.Buildings) != 0 || empty.Progress == nil {
		t.Fatalf("empty %v %v", empty, err)
	}
}

func TestProgressRejectsPartialDeltaDuplicateAndNonFiniteData(t *testing.T) {
	for _, kind := range []string{"partial", "delta", "duplicate", "trailing", "nan"} {
		t.Run(kind, func(t *testing.T) {
			values := progressValues(1)
			switch kind {
			case "partial":
				values[0] = values[0][:len(values[0])-1]
			case "delta":
				values[0][0] = 1
			case "duplicate":
				values[1] = completeSet("boss", "boss")
			case "trailing":
				values[1] = append(values[1], 0)
			case "nan":
				values = progressValues(float32(math.NaN()))
			}
			if _, err := dragonwilds.Decode(progressSave(values, nil)); err == nil {
				t.Fatal("invalid progress accepted")
			}
		})
	}
}

func TestBuildingsRejectTruncatedRecordsAndUnknownVersions(t *testing.T) {
	piece := buildingPiece(1, 0)
	for end := 1; end < len(piece); end++ {
		if _, err := dragonwilds.Decode(progressSave(progressValues(1), buildingCustom(piece[:end]))); err == nil {
			t.Fatalf("accepted piece cut at %d", end)
		}
	}
	for _, custom := range [][]byte{{1}, buildingCustom(append(piece, piece...)), buildingCustom(buildingPiece(1, 2))} {
		if _, err := dragonwilds.Decode(progressSave(progressValues(1), custom)); err == nil {
			t.Fatal("invalid building data accepted")
		}
	}
}
