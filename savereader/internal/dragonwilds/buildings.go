package dragonwilds

import (
	"fmt"
	"math"

	"github.com/oddessentials/magpie/savereader/internal/spud"
)

type Building struct {
	ID             uint32                `json:"id"`
	DataID         string                `json:"data_id"`
	Position       Position              `json:"position"`
	Yaw            float64               `json:"yaw"`
	Stability      float64               `json:"stability"`
	HealthFraction float64               `json:"health_fraction"`
	Unfinished     bool                  `json:"unfinished"`
	Requirements   []BuildingRequirement `json:"requirements"`
}

type BuildingRequirement struct {
	ItemID   string `json:"item_id"`
	Needed   uint32 `json:"needed"`
	Supplied uint32 `json:"supplied"`
}

func customSections(data []byte) (map[string][]byte, error) {
	a := spud.NewArchive(data)
	sections := map[string][]byte{}
	for a.Remaining() > 0 && a.Error() == nil {
		name := string(a.Take(4))
		body := a.Take(int(a.Uint32()))
		if _, ok := sections[name]; ok {
			return nil, fmt.Errorf("duplicate custom section %q", name)
		}
		sections[name] = body
	}
	return sections, a.Finish()
}

func decodeBuildings(object *spud.Object) ([]Building, error) {
	if len(object.Custom) == 0 {
		return nil, nil
	}
	if object.Custom[0] != 0 {
		return nil, fmt.Errorf("unsupported building save version %d", object.Custom[0])
	}
	sections, err := customSections(object.Custom[1:])
	if err != nil {
		return nil, err
	}
	body, ok := sections["Pces"]
	if !ok {
		return nil, fmt.Errorf("building save has no Pces section")
	}
	a := spud.NewArchive(body)
	buildings := []Building{}
	seen := map[uint32]bool{}
	for a.Remaining() > 0 && a.Error() == nil {
		piece := Building{ID: a.Uint32(), DataID: a.String(), Position: Position{a.Float64(), a.Float64(), a.Float64()}, Yaw: float64(a.Float32()), Stability: float64(a.Float32()), HealthFraction: float64(a.Float32()), Requirements: []BuildingRequirement{}}
		for n := a.Count(); n > 0 && a.Error() == nil; n-- {
			piece.Requirements = append(piece.Requirements, BuildingRequirement{ItemID: a.String()})
		}
		for i := range piece.Requirements {
			piece.Requirements[i].Needed = a.Uint32()
		}
		for i := range piece.Requirements {
			piece.Requirements[i].Supplied = a.Uint32()
		}
		forced := a.Uint32()
		ghosted := a.Uint8()
		if forced > 1 || ghosted > 1 {
			return nil, fmt.Errorf("invalid building flags")
		}
		piece.Unfinished = ghosted == 1
		for _, value := range []float64{piece.Position.X, piece.Position.Y, piece.Position.Z, piece.Yaw, piece.Stability, piece.HealthFraction} {
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return nil, fmt.Errorf("non-finite building state")
			}
		}
		if piece.ID == 0 || seen[piece.ID] || piece.DataID == "" {
			return nil, fmt.Errorf("invalid building identity")
		}
		seen[piece.ID] = true
		buildings = append(buildings, piece)
	}
	return buildings, a.Finish()
}
