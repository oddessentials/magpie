package saves

import (
	"math"
	"sort"

	"github.com/oddessentials/magpie/collector/internal/event"
)

const BaseCell = 5000.0

type piece struct {
	DataID     string `json:"data_id"`
	Unfinished bool   `json:"unfinished"`
	Position   *struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
		Z float64 `json:"z"`
	} `json:"position"`
	Requirements []struct {
		ItemID   string `json:"item_id"`
		Needed   int    `json:"needed"`
		Supplied int    `json:"supplied"`
	} `json:"requirements"`
}

type cell [2]int

func basesOf(pieces []piece) []event.SavedBase {
	members := map[cell][]int{}
	for i, p := range pieces {
		if p.Position == nil {
			continue
		}
		key := cell{int(math.Floor(p.Position.X / BaseCell)), int(math.Floor(p.Position.Y / BaseCell))}
		members[key] = append(members[key], i)
	}
	parent := map[cell]cell{}
	for key := range members {
		parent[key] = key
	}
	var find func(cell) cell
	find = func(key cell) cell {
		if parent[key] != key {
			parent[key] = find(parent[key])
		}
		return parent[key]
	}
	for key := range members {
		for dx := -1; dx <= 1; dx++ {
			for dy := -1; dy <= 1; dy++ {
				next := cell{key[0] + dx, key[1] + dy}
				if _, ok := members[next]; ok {
					a, b := find(key), find(next)
					if a != b {
						if a[0] < b[0] || (a[0] == b[0] && a[1] < b[1]) {
							parent[b] = a
						} else {
							parent[a] = b
						}
					}
				}
			}
		}
	}
	groups := map[cell][]int{}
	for key, indices := range members {
		root := find(key)
		groups[root] = append(groups[root], indices...)
	}
	bases := []event.SavedBase{}
	for _, indices := range groups {
		var base event.SavedBase
		for _, i := range indices {
			p := pieces[i]
			base.X += p.Position.X
			base.Y += p.Position.Y
			base.Z += p.Position.Z
			base.Pieces++
			if p.Unfinished {
				base.Unfinished++
			}
		}
		count := float64(base.Pieces)
		base.X = math.Round(base.X / count)
		base.Y = math.Round(base.Y / count)
		base.Z = math.Round(base.Z / count)
		bases = append(bases, base)
	}
	sort.Slice(bases, func(i, j int) bool {
		if bases[i].Pieces != bases[j].Pieces {
			return bases[i].Pieces > bases[j].Pieces
		}
		if bases[i].X != bases[j].X {
			return bases[i].X < bases[j].X
		}
		return bases[i].Y < bases[j].Y
	})
	return bases
}

func requirementsOf(pieces []piece) []event.SavedRequirement {
	missing := map[string]int{}
	for _, p := range pieces {
		if !p.Unfinished {
			continue
		}
		for _, requirement := range p.Requirements {
			if short := requirement.Needed - requirement.Supplied; short > 0 && requirement.ItemID != "" {
				missing[requirement.ItemID] += short
			}
		}
	}
	out := []event.SavedRequirement{}
	for item, count := range missing {
		out = append(out, event.SavedRequirement{Item: item, Missing: count})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Item < out[j].Item })
	return out
}
