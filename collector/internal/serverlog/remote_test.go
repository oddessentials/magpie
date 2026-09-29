package serverlog

import (
	"context"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oddessentials/magpie/collector/internal/remote"
)

type remoteFixture struct {
	data    string
	offline bool
	reads   [][2]int64
}

func (f *remoteFixture) Identity() string { return "fixture" }
func (f *remoteFixture) Stat(context.Context) (remote.Entry, error) {
	if f.offline {
		return remote.Entry{}, errors.New("disconnected")
	}
	return remote.Entry{Size: int64(len(f.data))}, nil
}
func (f *remoteFixture) Read(_ context.Context, offset, length int64, w io.Writer) error {
	f.reads = append(f.reads, [2]int64{offset, length})
	if f.offline {
		return errors.New("disconnected")
	}
	if offset+length > int64(len(f.data)) {
		return io.ErrUnexpectedEOF
	}
	_, err := io.WriteString(w, f.data[offset:offset+length])
	return err
}

func TestRemoteFollowerPartialReconnectRotateTruncateAndRestart(t *testing.T) {
	file := &remoteFixture{data: "first\npar"}
	source := &RemoteSource{File: file, CursorPath: filepath.Join(t.TempDir(), "cursor")}
	cursor := source.loadCursor()
	sink := &recordingSink{}
	poll := func() {
		t.Helper()
		if err := source.poll(context.Background(), sink, &cursor); err != nil {
			t.Fatal(err)
		}
	}
	poll()
	poll()
	if sink.texts() != "first" {
		t.Fatal("partial or duplicate line emitted")
	}
	file.offline = true
	if err := source.poll(context.Background(), sink, &cursor); err == nil {
		t.Fatal("outage hidden")
	}
	if cursor.Offset != 6 || sink.resets != 0 {
		t.Fatal("transport error changed log session")
	}
	file.offline = false
	file.data += "tial\n"
	poll()
	if sink.texts() != "first|partial" {
		t.Fatal(sink.texts())
	}
	resumed := source.loadCursor()
	if resumed.Offset != cursor.Offset {
		t.Fatal("committed cursor lost")
	}
	cursor = resumed
	poll()
	if sink.texts() != "first|partial" {
		t.Fatal("restart duplicated lines")
	}
	file.data = "other\nrotated\n"
	poll()
	if sink.resets != 1 || sink.texts() != "first|partial|other|rotated" {
		t.Fatalf("rotation %s %d", sink.texts(), sink.resets)
	}
	file.data = "new\n"
	poll()
	if sink.resets != 2 || !strings.HasSuffix(sink.texts(), "|new") {
		t.Fatal("truncation did not reset")
	}
	file.data += "incomplete"
	poll()
	file.data = "restarted\n"
	poll()
	if strings.Contains(sink.texts(), "incomplete") || !strings.HasSuffix(sink.texts(), "|restarted") {
		t.Fatal("partial tail leaked across replacement")
	}
}

func TestRemoteFollowerReadsOnlySuffixAndBoundedWitness(t *testing.T) {
	file := &remoteFixture{data: strings.Repeat("line\n", 10000)}
	source := &RemoteSource{File: file}
	cursor := source.loadCursor()
	sink := &recordingSink{}
	if err := source.poll(context.Background(), sink, &cursor); err != nil {
		t.Fatal(err)
	}
	file.reads = nil
	file.data += "last\n"
	if err := source.poll(context.Background(), sink, &cursor); err != nil {
		t.Fatal(err)
	}
	for _, read := range file.reads {
		if read[0] < 49936 || read[1] > 64 {
			t.Fatalf("downloaded old log: %v", read)
		}
	}
}
