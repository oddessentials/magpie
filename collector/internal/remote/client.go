package remote

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

const MaxSaveSize = 512 << 20

var ErrChanging = errors.New("remote file changed during retrieval")

type Options struct {
	URL       string
	Password  string
	KeyFile   string
	HostKey   string
	Timeout   time.Duration
	TLSConfig *tls.Config
}

type Entry struct {
	Name     string
	Size     int64
	Modified time.Time
	Dir      bool
}
type session interface {
	List(context.Context, string) ([]Entry, error)
	Fetch(context.Context, string, int64, int64, io.Writer) error
	Close() error
}

type Client struct {
	options Options
	target  *url.URL
	file    string
	open    func(context.Context) (session, error)
}

func Parse(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, errors.New("remote URL is invalid")
	}
	if u.Scheme != "ftp" && u.Scheme != "ftps" && u.Scheme != "sftp" {
		return nil, errors.New("remote URL must use ftp, ftps or sftp")
	}
	if u.Hostname() == "" || u.Path == "" || strings.HasSuffix(u.Path, "/") || u.RawQuery != "" || u.Fragment != "" || strings.ContainsAny(u.Path, "\r\n\x00") {
		return nil, errors.New("remote URL must identify one file without a query or fragment")
	}
	return u, nil
}

func New(options Options) (*Client, error) {
	u, err := Parse(options.URL)
	if err != nil {
		return nil, err
	}
	if u.Scheme == "sftp" && (!strings.HasPrefix(options.HostKey, "SHA256:") || strings.ContainsAny(options.HostKey, " \r\n")) {
		return nil, errors.New("SFTP requires an explicitly pinned SHA256 host key")
	}
	if options.Timeout <= 0 {
		options.Timeout = 30 * time.Second
	}
	file := u.Path
	if u.Scheme != "sftp" {
		file = strings.TrimPrefix(file, "/")
	}
	if strings.HasPrefix(file, "/~") {
		file = strings.TrimPrefix(strings.TrimPrefix(file, "/~"), "/")
	}
	c := &Client{options: options, target: u, file: file}
	c.open = c.dial
	return c, nil
}

func (c *Client) Identity() string {
	u := *c.target
	if u.User != nil {
		u.User = url.User(u.User.Username())
	}
	sum := sha256.Sum256([]byte(u.String()))
	return hex.EncodeToString(sum[:])
}

func (c *Client) dial(ctx context.Context) (session, error) {
	user, password := "anonymous", c.options.Password
	if c.target.User != nil {
		user = c.target.User.Username()
		if password == "" {
			password, _ = c.target.User.Password()
		}
	}
	if c.target.Scheme == "sftp" {
		return dialSFTP(ctx, c.target, user, password, c.options)
	}
	return dialFTP(ctx, c.target, user, password, c.options)
}

func (c *Client) Stat(ctx context.Context) (Entry, error) {
	ctx, cancel := context.WithTimeout(ctx, c.options.Timeout)
	defer cancel()
	s, err := c.open(ctx)
	if err != nil {
		return Entry{}, errors.New("remote connection failed")
	}
	defer s.Close()
	entries, err := s.List(ctx, path.Dir(c.file))
	if err != nil {
		return Entry{}, errors.New("remote file listing failed")
	}
	for _, entry := range entries {
		if entry.Name == path.Base(c.file) && !entry.Dir && entry.Size >= 0 {
			return entry, nil
		}
	}
	return Entry{}, errors.New("remote file is unavailable")
}

func (c *Client) Read(ctx context.Context, offset, length int64, w io.Writer) error {
	if offset < 0 || length < 0 || length > MaxSaveSize {
		return errors.New("remote read is out of bounds")
	}
	ctx, cancel := context.WithTimeout(ctx, c.options.Timeout)
	defer cancel()
	s, err := c.open(ctx)
	if err != nil {
		return errors.New("remote connection failed")
	}
	defer s.Close()
	if err := s.Fetch(ctx, c.file, offset, length, w); err != nil {
		return errors.New("remote transfer failed")
	}
	return nil
}

func same(a, b Entry) bool { return a.Size == b.Size && a.Modified.Equal(b.Modified) }

func (c *Client) Save(ctx context.Context, destination string, validate func(string) error) (Entry, error) {
	before, err := c.Stat(ctx)
	if err != nil {
		return Entry{}, err
	}
	if before.Size < 8 || before.Size > MaxSaveSize {
		return Entry{}, errors.New("remote save size is unsupported")
	}
	if before.Modified.IsZero() {
		return Entry{}, errors.New("remote save modification time is unavailable")
	}
	if validate == nil {
		return Entry{}, errors.New("remote save requires validation before publication")
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0700); err != nil {
		return Entry{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(destination), ".remote-save-*")
	if err != nil {
		return Entry{}, err
	}
	name := temp.Name()
	defer os.Remove(name)
	defer temp.Close()
	if err := c.Read(ctx, 0, before.Size, temp); err != nil {
		return Entry{}, err
	}
	if err := temp.Sync(); err != nil {
		return Entry{}, err
	}
	var header [8]byte
	if _, err := temp.ReadAt(header[:], 0); err != nil {
		return Entry{}, err
	}
	if string(header[:4]) != "SAVE" || int64(binary.LittleEndian.Uint32(header[4:])) != before.Size-8 {
		return Entry{}, errors.New("remote save is incomplete")
	}
	if err := temp.Close(); err != nil {
		return Entry{}, err
	}
	after, err := c.Stat(ctx)
	if err != nil {
		return Entry{}, err
	}
	if !same(before, after) {
		return Entry{}, ErrChanging
	}
	if !before.Modified.IsZero() {
		if err := os.Chtimes(name, before.Modified, before.Modified); err != nil {
			return Entry{}, err
		}
	}
	if err := validate(name); err != nil {
		return Entry{}, fmt.Errorf("remote save validation failed: %w", err)
	}
	if err := os.Rename(name, destination); err != nil {
		return Entry{}, err
	}
	return before, nil
}
