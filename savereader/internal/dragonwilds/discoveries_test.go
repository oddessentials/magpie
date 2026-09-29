package dragonwilds_test

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"os"
	"sort"
	"testing"

	"github.com/oddessentials/magpie/savereader/internal/dragonwilds"
	"github.com/oddessentials/magpie/savereader/internal/spud"
	st "github.com/oddessentials/magpie/savereader/internal/spud/spudtest"
)

type engineObject struct {
	Class      string `json:"class"`
	Custom     []byte `json:"custom"`
	Properties map[string]struct {
		Type uint16 `json:"type"`
		Data []byte `json:"data"`
	} `json:"properties"`
}

func engineSamples(t *testing.T) [][]engineObject {
	t.Helper()
	raw, err := os.ReadFile("testdata/engine-save-fields-25501739.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Samples [][]engineObject `json:"samples"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	return fixture.Samples
}

func engineSave(records []engineObject) []byte {
	level := st.Level{Name: "L_World"}
	for _, record := range records {
		class := st.Class{Name: record.Class}
		object := st.Object{Class: record.Class, Name: record.Class, Custom: record.Custom}
		names := []string{}
		for name := range record.Properties {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			property := record.Properties[name]
			class.Props = append(class.Props, st.Prop{Name: name, Type: property.Type})
			object.Values = append(object.Values, property.Data)
		}
		level.Classes = append(level.Classes, class)
		level.Objects = append(level.Objects, object)
	}
	return st.Save{SystemVersion: 8, Timestamp: savedAt.Format("2006-01-02T15:04:05.000Z"), Fields: headerFields(savedAt), CurrentLevel: "L_World", Levels: []st.Level{level}}.Bytes()
}

func TestEngineWrittenClockPOIsAndNonemptyProgress(t *testing.T) {
	for index, records := range engineSamples(t) {
		world, err := dragonwilds.Decode(engineSave(records))
		if err != nil {
			t.Fatal(err)
		}
		if world.ClockSeconds == nil || *world.ClockSeconds != 1800 {
			t.Fatalf("clock %+v", world.ClockSeconds)
		}
		if len(world.Discoveries) != index+1 {
			t.Fatalf("discoveries %+v", world.Discoveries)
		}
		first := world.Discoveries[0]
		if first.CharacterGUID != "11111111222222223333333344444444" || len(first.POIs) != 2 || first.POIs[1] != "123456789ABCDEF013579BDF2468ACE0" {
			t.Fatalf("first %+v", first)
		}
		if index == 1 && (world.Discoveries[1].CharacterGUID != "00000001000000020000000300000004" || world.Discoveries[1].POIs[0] != "00000005000000060000000700000008") {
			t.Fatalf("second %+v", world.Discoveries[1])
		}
		if world.Progress == nil || len(world.Progress.DefeatedBosses) != 2 || world.Progress.DefeatedBosses[1] != "MagpieFixtureBoss" || len(world.Progress.Values) != 2 || world.Progress.Values[0].Value != 7.25 || world.Progress.Values[1].Value != -2.5 {
			t.Fatalf("progress %+v", world.Progress)
		}
	}
}

func TestPOIDecoderRejectsTruncatedDuplicateAndUnframedData(t *testing.T) {
	record := engineSamples(t)[1][2]
	valid := append([]byte(nil), record.Custom...)
	for size := 1; size < len(valid); size++ {
		record.Custom = valid[:size]
		if _, err := dragonwilds.Decode(engineSave([]engineObject{record})); err == nil {
			t.Fatalf("accepted %d bytes", size)
		}
	}
	mutations := []func([]byte) []byte{
		func(data []byte) []byte { binary.LittleEndian.PutUint32(data[4:], ^uint32(0)); return data },
		func(data []byte) []byte { data[0] = 'X'; return data },
		func(data []byte) []byte { copy(data[24:40], data[8:24]); return data },
		func(data []byte) []byte { copy(data[64:80], data[48:64]); return data },
		func(data []byte) []byte { return append(data, 1) },
	}
	for index, mutate := range mutations {
		record.Custom = mutate(append([]byte(nil), valid...))
		if _, err := dragonwilds.Decode(engineSave([]engineObject{record})); err == nil {
			t.Fatalf("accepted malformed payload %d", index)
		}
	}
}

func TestPOIMissingAndEmptyRemainDifferent(t *testing.T) {
	record := engineSamples(t)[0][2]
	record.Custom = nil
	world, err := dragonwilds.Decode(engineSave([]engineObject{record}))
	if err != nil || world.Discoveries != nil {
		t.Fatalf("missing %+v %v", world, err)
	}
	record.Custom = st.Chunk("Play", nil)
	world, err = dragonwilds.Decode(engineSave([]engineObject{record}))
	if err != nil || world.Discoveries == nil || len(world.Discoveries) != 0 {
		t.Fatalf("empty %+v %v", world, err)
	}
}

func TestSavedClockZeroUnknownAndInvalid(t *testing.T) {
	record := engineSamples(t)[0][1]
	for _, seconds := range []float32{0, 2671.5, -1, float32(math.Inf(1)), float32(math.NaN())} {
		record.Properties["StoredTime"] = struct {
			Type uint16 `json:"type"`
			Data []byte `json:"data"`
		}{spud.TypeFloat, new(st.Buffer).F32(seconds).Bytes()}
		world, err := dragonwilds.Decode(engineSave([]engineObject{record}))
		if seconds < 0 || math.IsInf(float64(seconds), 0) || math.IsNaN(float64(seconds)) {
			if err == nil {
				t.Fatalf("accepted clock %v", seconds)
			}
		} else if err != nil || world.ClockSeconds == nil || *world.ClockSeconds != float64(seconds) {
			t.Fatalf("clock %+v %v", world, err)
		}
	}
	record.Properties = nil
	world, err := dragonwilds.Decode(engineSave([]engineObject{record}))
	if err != nil || world.ClockSeconds != nil {
		t.Fatalf("missing clock %+v %v", world, err)
	}
}
