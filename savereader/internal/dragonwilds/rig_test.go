package dragonwilds_test

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oddessentials/magpie/savereader/internal/dragonwilds"
	"github.com/oddessentials/magpie/savereader/internal/spud"
)

func stringValues(value any, visit func(string)) {
	switch v := value.(type) {
	case string:
		visit(v)
	case []any:
		for _, item := range v {
			stringValues(item, visit)
		}
	case map[string]any:
		for key, item := range v {
			visit(key)
			stringValues(item, visit)
		}
	}
}

func TestSavesFromTheRig(t *testing.T) {
	root := os.Getenv("MAGPIE_RIG_SAVES")
	if root == "" {
		t.Skip("set MAGPIE_RIG_SAVES to a folder holding rig world saves to run this")
	}
	found := 0
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || (!strings.HasSuffix(path, ".sav") && !strings.HasSuffix(path, ".sav.backup")) {
			return nil
		}
		found++
		rel, _ := filepath.Rel(root, path)
		t.Run(rel, func(t *testing.T) {
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			save, err := spud.Parse(data)
			if err != nil {
				t.Fatal(err)
			}
			world, err := dragonwilds.Decode(data)
			if err != nil {
				t.Fatal(err)
			}
			out, err := json.Marshal(world)
			if err != nil {
				t.Fatal(err)
			}
			var generic any
			if err := json.Unmarshal(out, &generic); err != nil {
				t.Fatal(err)
			}
			password, _ := save.Info.String("SessionPasswd")
			stringValues(generic, func(s string) {
				if (password != "" && s == password) || strings.Contains(strings.ToLower(s), "passw") {
					t.Fatalf("%q leaked into the output", s)
				}
			})
			if world.World.Name == "" || world.World.GUID == "" || world.SavedAt.IsZero() {
				t.Fatalf("header %+v at %v", world.World, world.SavedAt)
			}
			if len(world.Weather) == 0 || len(world.Events) == 0 {
				t.Fatalf("%d weather regions, %d events", len(world.Weather), len(world.Events))
			}
			for _, c := range world.Characters {
				if !c.Intact || c.Name == "" || len(c.Skills) == 0 || c.Position == nil {
					t.Fatalf("character %s is not fully decoded: intact %v, %d skills, position %v", c.GUID, c.Intact, len(c.Skills), c.Position)
				}
			}
			t.Logf("%s: %d levels, %d weather regions, %d events, %d characters", world.World.Name, len(save.Levels), len(world.Weather), len(world.Events), len(world.Characters))
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if found == 0 {
		t.Fatalf("no saves under %s", root)
	}
}
