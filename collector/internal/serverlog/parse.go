package serverlog

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Record struct {
	Timestamp string
	Frame     string
	Category  string
	Level     string
	Message   string
}

type Line struct {
	Text       string
	ReceivedAt time.Time
	SourceTime time.Time
	Reset      bool
}

var (
	vtSequence = regexp.MustCompile(`\x1b\[[0-9;?<=>]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>78DEHMNOZc]`)
	stamped    = regexp.MustCompile(`^\[(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3})\]\[\s*(\d+)\](.*)$`)
	categoryRe = regexp.MustCompile(`^([A-Za-z][A-Za-z0-9_]*): (?:(Display|Verbose|VeryVerbose|Warning|Error|Fatal): )?(.*)$`)
)

func Clean(raw string) string {
	cleaned := vtSequence.ReplaceAllString(raw, "")
	var out strings.Builder
	out.Grow(len(cleaned))
	for _, r := range cleaned {
		if r == '\t' || r >= 0x20 && r != 0x7f && r != 0xfffd {
			out.WriteRune(r)
		}
	}
	return strings.TrimSpace(out.String())
}

func Parse(line string) (Record, bool) {
	rest := line
	var record Record
	if match := stamped.FindStringSubmatch(line); match != nil {
		record.Timestamp = match[1]
		record.Frame = match[2]
		rest = match[3]
	}
	match := categoryRe.FindStringSubmatch(rest)
	if match == nil {
		if rest == "" {
			return Record{}, false
		}
		record.Message = rest
		return record, true
	}
	record.Category = match[1]
	record.Level = match[2]
	record.Message = match[3]
	return record, true
}

func ParseTimestamp(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	base, millis, found := strings.Cut(value, ":")
	if !found {
		return time.Time{}, false
	}
	parsed, err := time.ParseInLocation("2006.01.02-15.04.05", base, time.UTC)
	if err != nil {
		return time.Time{}, false
	}
	ms, err := strconv.Atoi(millis)
	if err != nil || ms < 0 || ms > 999 {
		return time.Time{}, false
	}
	return parsed.Add(time.Duration(ms) * time.Millisecond), true
}
