package dragonwilds

import (
	"fmt"
	"math"
	"sort"

	"github.com/oddessentials/magpie/savereader/internal/spud"
)

type WorldProgress struct {
	WorldHooks     []string        `json:"world_hooks"`
	DefeatedBosses []string        `json:"defeated_bosses"`
	Values         []ProgressValue `json:"values"`
}

type ProgressValue struct {
	Tag   string  `json:"tag"`
	Value float64 `json:"value"`
}

func progressArchive(object *spud.Object, name string) (*spud.Archive, error) {
	value, ok := object.Property(name)
	if !ok || value.Type != spud.TypeRecord {
		return nil, fmt.Errorf("missing or unsupported %s", name)
	}
	a := spud.NewArchive(value.Data)
	if a.Uint32() != 0 {
		return nil, fmt.Errorf("%s is a delta, not a complete saved set", name)
	}
	return a, nil
}

func stringSet(object *spud.Object, name string) ([]string, error) {
	a, err := progressArchive(object, name)
	if err != nil {
		return nil, err
	}
	values := []string{}
	seen := map[string]bool{}
	for n := a.Count(); n > 0 && a.Error() == nil; n-- {
		value := a.String()
		if seen[value] {
			return nil, fmt.Errorf("duplicate %s entry", name)
		}
		seen[value] = true
		values = append(values, value)
	}
	sort.Strings(values)
	return values, a.Finish()
}

func decodeProgress(object *spud.Object) (*WorldProgress, error) {
	p := &WorldProgress{Values: []ProgressValue{}}
	var err error
	if p.WorldHooks, err = stringSet(object, "WorldHooksTriggered"); err != nil {
		return nil, err
	}
	if p.DefeatedBosses, err = stringSet(object, "DefeatedBossesInternalNames"); err != nil {
		return nil, err
	}
	a, err := progressArchive(object, "TaggedWorldProgressValues")
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for n := a.Count(); n > 0 && a.Error() == nil; n-- {
		entry, err := a.Entry()
		if err != nil {
			return nil, err
		}
		tag, err := entry.String("TagName")
		if err != nil {
			return nil, err
		}
		value := float64(a.Float32())
		if tag == "" || seen[tag] || math.IsNaN(value) || math.IsInf(value, 0) {
			return nil, fmt.Errorf("invalid tagged world progress value")
		}
		seen[tag] = true
		p.Values = append(p.Values, ProgressValue{tag, value})
	}
	sort.Slice(p.Values, func(i, j int) bool { return p.Values[i].Tag < p.Values[j].Tag })
	return p, a.Finish()
}
