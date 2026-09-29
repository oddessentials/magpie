package serverlog

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"time"

	"github.com/oddessentials/magpie/collector/internal/remote"
)

const remoteReadLimit = 4 << 20

type RemoteFile interface {
	Identity() string
	Stat(context.Context) (remote.Entry, error)
	Read(context.Context, int64, int64, io.Writer) error
}

type RemoteSource struct {
	File       RemoteFile
	CursorPath string
	Poll       time.Duration
}
type remoteCursor struct {
	Identity string `json:"identity"`
	Offset   int64  `json:"offset"`
	Witness  []byte `json:"witness"`
}

func (s *RemoteSource) Name() string { return "remote" }
func (s *RemoteSource) loadCursor() remoteCursor {
	cursor := remoteCursor{Identity: s.File.Identity()}
	raw, err := os.ReadFile(s.CursorPath)
	var saved remoteCursor
	if err == nil && json.Unmarshal(raw, &saved) == nil && saved.Identity == cursor.Identity && saved.Offset >= 0 && len(saved.Witness) == int(min(saved.Offset, 64)) {
		return saved
	}
	return cursor
}
func (s *RemoteSource) saveCursor(cursor remoteCursor) error {
	if s.CursorPath == "" {
		return nil
	}
	raw, err := json.Marshal(cursor)
	if err != nil {
		return err
	}
	return writeFileAtomic(s.CursorPath, raw)
}
func (s *RemoteSource) read(ctx context.Context, offset, length int64) ([]byte, error) {
	var buf bytes.Buffer
	err := s.File.Read(ctx, offset, length, &buf)
	if err != nil {
		return nil, err
	}
	if int64(buf.Len()) != length {
		return nil, io.ErrUnexpectedEOF
	}
	return buf.Bytes(), nil
}

func (s *RemoteSource) poll(ctx context.Context, sink Sink, cursor *remoteCursor) error {
	before, err := s.File.Stat(ctx)
	if err != nil {
		return err
	}
	reset := before.Size < cursor.Offset
	if !reset && cursor.Offset > 0 {
		witness, err := s.read(ctx, cursor.Offset-int64(len(cursor.Witness)), int64(len(cursor.Witness)))
		if err != nil {
			return err
		}
		reset = !bytes.Equal(witness, cursor.Witness)
	}
	if reset {
		*cursor = remoteCursor{Identity: s.File.Identity()}
		sink.Line(Line{Reset: true, ReceivedAt: time.Now()})
		if err := s.saveCursor(*cursor); err != nil {
			return err
		}
	}
	length := min(before.Size-cursor.Offset, remoteReadLimit)
	if length == 0 {
		sink.State(StateConnected, nil)
		return nil
	}
	chunk, err := s.read(ctx, cursor.Offset, length)
	if err != nil {
		return err
	}
	after, err := s.File.Stat(ctx)
	if err != nil {
		return err
	}
	if after.Size < before.Size {
		return remote.ErrChanging
	}
	last := bytes.LastIndexByte(chunk, '\n')
	if last < 0 {
		if length == remoteReadLimit {
			return errors.New("remote log line exceeds the read limit")
		}
		sink.State(StateConnected, nil)
		return nil
	}
	consumed := int64(last + 1)
	witnessOffset := max(int64(0), cursor.Offset+consumed-64)
	witness, err := s.read(ctx, witnessOffset, cursor.Offset+consumed-witnessOffset)
	if err != nil {
		return err
	}
	combined := append(append([]byte{}, cursor.Witness...), chunk[:last+1]...)
	expected := combined[max(0, len(combined)-64):]
	if !bytes.Equal(witness, expected) {
		return remote.ErrChanging
	}
	for _, raw := range bytes.Split(chunk[:last], []byte{'\n'}) {
		if text := Clean(string(bytes.TrimRight(raw, "\r"))); text != "" {
			sink.Line(Line{Text: text, ReceivedAt: time.Now()})
		}
	}
	cursor.Offset += consumed
	cursor.Witness = witness
	if err := s.saveCursor(*cursor); err != nil {
		return err
	}
	sink.State(StateConnected, nil)
	return nil
}

func (s *RemoteSource) Run(ctx context.Context, sink Sink) error {
	poll := s.Poll
	if poll <= 0 {
		poll = 5 * time.Second
	}
	cursor := s.loadCursor()
	sink.State(StateConnecting, nil)
	for {
		if err := s.poll(ctx, sink, &cursor); err != nil && ctx.Err() == nil {
			sink.State(StateDown, err)
		}
		if !sleepContext(ctx, poll) {
			return nil
		}
	}
}
