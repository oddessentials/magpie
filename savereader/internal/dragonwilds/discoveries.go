package dragonwilds

import (
	"fmt"
	"math"

	"github.com/oddessentials/magpie/savereader/internal/spud"
)

type Discovery struct {
	CharacterGUID string   `json:"character_guid"`
	POIs          []string `json:"pois"`
}

func decodeClock(object *spud.Object) (*float64, error) {
	value, found := object.Property("StoredTime")
	if !found {
		return nil, nil
	}
	stored, err := value.Float32()
	seconds := float64(stored)
	if err != nil || math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 {
		return nil, fmt.Errorf("invalid saved clock")
	}
	return &seconds, nil
}

func discoveryGUIDs(a *spud.Archive) ([]string, error) {
	if string(a.Take(4)) != "Play" {
		return nil, fmt.Errorf("missing POI Play section")
	}
	size := a.Uint32()
	if size%16 != 0 || uint64(size) > uint64(a.Remaining()) {
		return nil, fmt.Errorf("invalid POI GUID section length")
	}
	guids := []string{}
	seen := map[string]bool{}
	for remaining := size; remaining > 0 && a.Error() == nil; remaining -= 16 {
		guid := spud.GUID(a.Take(16))
		if guid == "00000000000000000000000000000000" || seen[guid] {
			return nil, fmt.Errorf("invalid or duplicate POI GUID")
		}
		seen[guid] = true
		guids = append(guids, guid)
	}
	return guids, a.Error()
}

func decodeDiscoveries(object *spud.Object) ([]Discovery, error) {
	if len(object.Custom) == 0 {
		return nil, nil
	}
	a := spud.NewArchive(object.Custom)
	characters, err := discoveryGUIDs(a)
	if err != nil {
		return nil, err
	}
	discoveries := []Discovery{}
	for _, guid := range characters {
		pois, err := discoveryGUIDs(a)
		if err != nil {
			return nil, err
		}
		discoveries = append(discoveries, Discovery{CharacterGUID: guid, POIs: pois})
	}
	return discoveries, a.Finish()
}
