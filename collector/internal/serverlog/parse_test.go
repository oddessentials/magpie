package serverlog

import (
	"strings"
	"testing"
	"time"
)

func TestParseSplitsTimestampCategoryAndLevel(t *testing.T) {
	record, ok := Parse(`[2026.09.28-21.57.46:054][400]LogNet: Login request: ?p=[password]?pf=PC?cpx=1?c?Name=Wanderer userId: RedpointEOS:00000000000000000000000000000abc platform: RedpointEOS`)
	if !ok || record.Timestamp != "2026.09.28-21.57.46:054" || record.Frame != "400" || record.Category != "LogNet" || record.Level != "" {
		t.Fatalf("record %+v", record)
	}
	if !strings.HasPrefix(record.Message, "Login request: ?p=") {
		t.Fatalf("message %q", record.Message)
	}
	record, ok = Parse(`[2026.09.28-22.03.13:176][246]LogSpawn: Warning: SpawnActor failed to find teleport spot [X=8233.643 Y=170681.779 Z=-1276.647] for [BP_PlayerGravestone_C]`)
	if !ok || record.Category != "LogSpawn" || record.Level != "Warning" || !strings.HasPrefix(record.Message, "SpawnActor failed") {
		t.Fatalf("record %+v", record)
	}
	record, ok = Parse(`LogInit: Build: ++dominion+hotfix-CL-244954`)
	if !ok || record.Timestamp != "" || record.Category != "LogInit" || record.Message != "Build: ++dominion+hotfix-CL-244954" {
		t.Fatalf("record %+v", record)
	}
	record, ok = Parse(`[2026.09.28-21.50.27:136][132]LogRedpointEOS: Warning: EOS_SessionModification_AddAttribute called for string attribute '', but the string value has a length of 0`)
	if !ok || record.Level != "Warning" || record.Category != "LogRedpointEOS" {
		t.Fatalf("record %+v", record)
	}
	record, ok = Parse(`just text without a category`)
	if !ok || record.Category != "" || record.Message != "just text without a category" {
		t.Fatalf("record %+v", record)
	}
	if _, ok := Parse(""); ok {
		t.Fatal("an empty line is nothing")
	}
}

func TestParseTimestampIsUTCWithMilliseconds(t *testing.T) {
	at, ok := ParseTimestamp("2026.09.28-21.57.46:054")
	if !ok || !at.Equal(time.Date(2026, 9, 28, 21, 57, 46, 54000000, time.UTC)) {
		t.Fatalf("%v %v", at, ok)
	}
	for _, bad := range []string{"", "2026-09-28 21:57:46", "2026.09.28-21.57.46", "2026.09.28-21.57.46:1000"} {
		if _, ok := ParseTimestamp(bad); ok {
			t.Fatalf("%q parsed", bad)
		}
	}
}

func TestCleanStripsConsoleSequences(t *testing.T) {
	if got := Clean("\x1b[32mLogInit: Build: x\x1b[0m\r"); got != "LogInit: Build: x" {
		t.Fatalf("%q", got)
	}
}

func TestWithLaunchFlagsAddsWhatTheCollectorNeeds(t *testing.T) {
	args, added := WithLaunchFlags([]string{"-log", "-UNATTENDED"})
	if strings.Join(args, " ") != "-log -UNATTENDED -ForceLogFlush" || strings.Join(added, " ") != "-ForceLogFlush" {
		t.Fatalf("%v %v", args, added)
	}
	args, added = WithLaunchFlags(nil)
	if strings.Join(args, " ") != "-unattended -ForceLogFlush" || len(added) != 2 {
		t.Fatalf("%v %v", args, added)
	}
}
