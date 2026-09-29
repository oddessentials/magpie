package modevents

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	TypeChat          = "chat"
	TypePlayerEvent   = "player_event"
	TypeDeath         = "death"
	TypeRespawn       = "respawn"
	TypeKicked        = "kicked"
	TypeAdminAction   = "admin_action"
	TypeSkillLevel    = "skill_level"
	TypeXP            = "xp"
	TypeXPChanged     = "xp_changed"
	TypeQuest         = "quest"
	TypeQuestComplete = "quest_complete"
	TypeBuild         = "build"
	TypeCraft         = "craft"
	TypeModLoaded     = "mod_loaded"
	TypeStopRequested = "stop_requested"
	TypeSaveRequested = "save_requested"
	TypeSaveDone      = "save_done"
	TypeSaveFailed    = "save_failed"
	TypeQuit          = "quit"
	TypeQuitFailed    = "quit_failed"
)

type Record struct {
	Type       string
	At         time.Time
	Hook       string
	Self       string
	PlayerName string
	Platform   string
	Params     map[string]any
}

var (
	ErrVersion = errors.New("unsupported mod event version")
	hexID      = regexp.MustCompile(`\b[0-9a-fA-F]{32}\b`)
	typeChars  = regexp.MustCompile(`[^a-z0-9_]+`)
	countShape = regexp.MustCompile(`^\[(\d+)\]$`)
)

var envelopeKeys = map[string]bool{
	"v": true, "type": true, "ts": true, "hook": true, "self": true, "player_name": true,
	"session_id": true, "owner": true, "platform": true, "file": true, "stop": true,
}

var idKeys = []string{"netid", "replicationbytes", "guid", "uniqueid", "platformdata", "accountid", "ownerid", "userid", "sessionid", "playerid"}

func isIDKey(key string) bool {
	lower := strings.ToLower(key)
	for _, marker := range idKeys {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

func Strip(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, entry := range typed {
			if isIDKey(key) {
				continue
			}
			out[key] = Strip(entry)
		}
		return out
	case []any:
		out := make([]any, 0, len(typed))
		for _, entry := range typed {
			out = append(out, Strip(entry))
		}
		return out
	case string:
		return hexID.ReplaceAllString(typed, "[id]")
	default:
		return typed
	}
}

func Parse(line string, received time.Time) (Record, error) {
	var fields map[string]any
	decoder := json.NewDecoder(strings.NewReader(line))
	decoder.UseNumber()
	if err := decoder.Decode(&fields); err != nil {
		return Record{}, fmt.Errorf("reading a mod event: %w", err)
	}
	version, _ := fields["v"].(json.Number)
	if version.String() != "1" {
		return Record{}, fmt.Errorf("%w %s", ErrVersion, version.String())
	}
	kind, _ := fields["type"].(string)
	if kind == "" {
		return Record{}, errors.New("a mod event needs a type")
	}
	record := Record{Type: kind, At: received, Params: map[string]any{}}
	if stamp, ok := fields["ts"].(string); ok {
		if at, err := time.Parse(time.RFC3339, stamp); err == nil {
			record.At = at
		}
	}
	record.Hook, _ = fields["hook"].(string)
	record.Self, _ = fields["self"].(string)
	record.PlayerName, _ = fields["player_name"].(string)
	record.Platform = platformFamily(fields["platform"])
	for key, value := range fields {
		if envelopeKeys[key] || isIDKey(key) {
			continue
		}
		record.Params[key] = Strip(plain(value))
	}
	return record, nil
}

func plain(value any) any {
	switch typed := value.(type) {
	case json.Number:
		if integer, err := typed.Int64(); err == nil {
			return float64(integer)
		}
		if float, err := typed.Float64(); err == nil {
			return float
		}
		return typed.String()
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, entry := range typed {
			out[key] = plain(entry)
		}
		return out
	case []any:
		out := make([]any, 0, len(typed))
		for _, entry := range typed {
			out = append(out, plain(entry))
		}
		return out
	default:
		return typed
	}
}

func platformFamily(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.ToLower(typed)
	case map[string]any:
		for _, key := range []string{"PlatformName", "PlatformType", "Platform"} {
			if name, ok := typed[key].(string); ok && name != "" && name != "None" {
				return strings.ToLower(name)
			}
		}
	}
	return ""
}

func TypeName(kind string) string {
	name := typeChars.ReplaceAllString(strings.ToLower(kind), "_")
	name = strings.Trim(name, "_")
	if name == "" || name[0] < 'a' || name[0] > 'z' {
		name = "event_" + name
	}
	if len(name) > 58 {
		name = name[:58]
	}
	return "mod." + name
}

func Lookup(params map[string]any, path ...string) (any, bool) {
	var current any = params
	for _, key := range path {
		object, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = object[key]
		if !ok {
			return nil, false
		}
	}
	return current, true
}

func String(params map[string]any, path ...string) string {
	value, ok := Lookup(params, path...)
	if !ok {
		return ""
	}
	text, _ := value.(string)
	return text
}

func Number(params map[string]any, path ...string) (float64, bool) {
	value, ok := Lookup(params, path...)
	if !ok {
		return 0, false
	}
	number, ok := value.(float64)
	return number, ok
}

func Count(params map[string]any, path ...string) (int, bool) {
	value, ok := Lookup(params, path...)
	if !ok {
		return 0, false
	}
	switch typed := value.(type) {
	case []any:
		return len(typed), true
	case string:
		if match := countShape.FindStringSubmatch(typed); match != nil {
			count, _ := strconv.Atoi(match[1])
			return count, true
		}
	}
	return 0, false
}

func FindString(params map[string]any, markers ...string) string {
	var found string
	walk(params, func(key string, value any) bool {
		text, ok := value.(string)
		if !ok || text == "" {
			return false
		}
		lower := strings.ToLower(key)
		for _, marker := range markers {
			if strings.Contains(lower, marker) {
				found = text
				return true
			}
		}
		return false
	})
	return found
}

func FindNumber(params map[string]any, markers ...string) (float64, bool) {
	var found float64
	ok := false
	walk(params, func(key string, value any) bool {
		number, isNumber := value.(float64)
		if !isNumber {
			return false
		}
		lower := strings.ToLower(key)
		for _, marker := range markers {
			if strings.Contains(lower, marker) {
				found, ok = number, true
				return true
			}
		}
		return false
	})
	return found, ok
}

func FindPosition(params map[string]any) (x, y, z float64, ok bool) {
	walk(params, func(key string, value any) bool {
		object, isObject := value.(map[string]any)
		if !isObject {
			return false
		}
		px, okX := object["X"].(float64)
		py, okY := object["Y"].(float64)
		pz, okZ := object["Z"].(float64)
		if okX && okY && okZ {
			x, y, z, ok = px, py, pz, true
			return true
		}
		return false
	})
	return
}

func walk(value any, visit func(key string, value any) bool) bool {
	object, ok := value.(map[string]any)
	if !ok {
		return false
	}
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, key)
	}
	sortStrings(keys)
	for _, key := range keys {
		if visit(key, object[key]) {
			return true
		}
	}
	for _, key := range keys {
		if walk(object[key], visit) {
			return true
		}
	}
	return false
}

func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

func AssetName(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if index := strings.LastIndexAny(path, "/."); index >= 0 && index+1 < len(path) {
		path = path[index+1:]
	}
	return strings.TrimSuffix(path, "_C")
}
