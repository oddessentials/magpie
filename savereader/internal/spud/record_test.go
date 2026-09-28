package spud_test

import (
	"strings"
	"testing"

	"github.com/oddessentials/magpie/savereader/internal/spud"
	st "github.com/oddessentials/magpie/savereader/internal/spud/spudtest"
)

func TestParsesTaggedRecords(t *testing.T) {
	guid := "21CB800A41067666EB379A8674F38B90"
	flagged := new(st.Buffer).String("Indexed").Raw(st.TypeName("IntProperty")).U32(4).U8(0x03).I32(2).GUID(guid).I32(-5).Bytes()
	record := st.Record(
		st.Entry(
			st.CharacterGUID("CharacterGuid", guid),
			st.Str("State", `{"Version":83}`),
			st.Float("LastUpdated", 1441.5),
			st.Bool("Alive", true),
			st.Bool("Dead", false),
			st.Transform("Transform", 1, 2, 3),
			flagged,
		),
		st.Entry(),
	)
	entries, err := spud.ParseRecord(record)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || len(entries[0]) != 7 || len(entries[1]) != 0 {
		t.Fatalf("entries %+v", entries)
	}
	entry := entries[0]
	inner, err := entry.Struct("CharacterGuid")
	if err != nil {
		t.Fatal(err)
	}
	raw, kind, err := inner.Native("InnerGuid")
	if err != nil || kind != "Guid" || spud.GUID(raw) != guid {
		t.Fatalf("InnerGuid %x %s %v", raw, kind, err)
	}
	if state, err := entry.String("State"); err != nil || state != `{"Version":83}` {
		t.Fatalf("State %q %v", state, err)
	}
	if updated, err := entry.Float("LastUpdated"); err != nil || updated != 1441.5 {
		t.Fatalf("LastUpdated %v %v", updated, err)
	}
	for name, want := range map[string]bool{"Alive": true, "Dead": false} {
		tag, ok := entry.Find(name)
		if !ok {
			t.Fatalf("%s missing", name)
		}
		if got, err := tag.Bool(); err != nil || got != want {
			t.Fatalf("%s %v %v", name, got, err)
		}
	}
	transform, err := entry.Struct("Transform")
	if err != nil {
		t.Fatal(err)
	}
	if translation, kind, err := transform.Native("Translation"); err != nil || kind != "Vector" || len(translation) != 24 {
		t.Fatalf("Translation %x %s %v", translation, kind, err)
	}
	tag, ok := entry.Find("Indexed")
	if !ok || tag.Flags != 0x03 || tag.Type.Name != "IntProperty" || len(tag.Value) != 4 || tag.Value[0] != 0xFB {
		t.Fatalf("Indexed %+v %v", tag, ok)
	}
	if _, err := entry.String("LastUpdated"); err == nil {
		t.Fatal("a float read as a string")
	}
	if _, err := entry.Struct("State"); err == nil {
		t.Fatal("a string read as a struct")
	}
	if _, _, err := entry.Native("Transform"); err == nil {
		t.Fatal("a tagged struct read as native")
	}
	if _, err := entry.Float("Missing"); err == nil {
		t.Fatal("a missing tag was found")
	}
}

func TestRejectsBrokenRecords(t *testing.T) {
	extensions := new(st.Buffer).String("Ext").Raw(st.TypeName("IntProperty")).U32(4).U8(0x04).I32(1).Bytes()
	if _, err := spud.ParseRecord(st.Record(st.Entry(extensions))); err == nil || !strings.Contains(err.Error(), "extensions") {
		t.Fatalf("extensions: %v", err)
	}
	unterminated := st.Record(st.Str("State", "x"))
	if _, err := spud.ParseRecord(unterminated); err == nil {
		t.Fatal("an entry without None parsed")
	}
	oversized := new(st.Buffer).I32(1).String("Big").Raw(st.TypeName("StrProperty")).U32(1000).U8(0).Bytes()
	if _, err := spud.ParseRecord(oversized); err == nil {
		t.Fatal("a value past the end parsed")
	}
	if _, err := spud.ParseRecord(new(st.Buffer).I32(3).Bytes()); err == nil {
		t.Fatal("a count without entries parsed")
	}
}
