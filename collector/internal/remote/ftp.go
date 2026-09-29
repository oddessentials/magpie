package remote

import (
	"context"
	"crypto/tls"
	"io"
	"net"
	"net/url"
	"path"
	"sync"

	"github.com/jlaffaye/ftp"
)

type connections struct {
	mu      sync.Mutex
	closed  bool
	sockets []net.Conn
}

func (s *connections) add(conn net.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		conn.Close()
	} else {
		s.sockets = append(s.sockets, conn)
	}
}
func (s *connections) close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
	for _, conn := range s.sockets {
		conn.Close()
	}
}

type ftpSession struct {
	conn    *ftp.ServerConn
	sockets *connections
	stop    func() bool
}

func dialFTP(ctx context.Context, target *url.URL, user, password string, opts Options) (*ftpSession, error) {
	port := target.Port()
	if port == "" {
		port = "21"
	}
	sockets := &connections{}
	stop := context.AfterFunc(ctx, sockets.close)
	secure := target.Scheme == "ftps"
	tlsConfig := &tls.Config{ServerName: target.Hostname(), MinVersion: tls.VersionTLS12}
	if opts.TLSConfig != nil {
		tlsConfig = opts.TLSConfig.Clone()
		tlsConfig.ServerName = target.Hostname()
		tlsConfig.MinVersion = tls.VersionTLS12
	}
	first := true
	dialer := net.Dialer{Timeout: opts.Timeout}
	dial := func(network, address string) (net.Conn, error) {
		conn, err := dialer.DialContext(ctx, network, address)
		if err != nil {
			return nil, err
		}
		sockets.add(conn)
		if deadline, ok := ctx.Deadline(); ok {
			conn.SetDeadline(deadline)
		}
		control := first
		first = false
		if secure && !control {
			return tls.Client(conn, tlsConfig), nil
		}
		return conn, nil
	}
	options := []ftp.DialOption{ftp.DialWithDialFunc(dial), ftp.DialWithShutTimeout(opts.Timeout)}
	if secure {
		options = append(options, ftp.DialWithExplicitTLS(tlsConfig))
	}
	conn, err := ftp.Dial(net.JoinHostPort(target.Hostname(), port), options...)
	if err == nil {
		err = conn.Login(user, password)
	}
	if err != nil {
		stop()
		sockets.close()
		return nil, err
	}
	return &ftpSession{conn: conn, sockets: sockets, stop: stop}, nil
}

func (s *ftpSession) List(ctx context.Context, dir string) ([]Entry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	listed, err := s.conn.List(dir)
	if err != nil {
		return nil, err
	}
	entries := []Entry{}
	for _, item := range listed {
		if item.Type == ftp.EntryTypeLink {
			continue
		}
		entry := Entry{Name: item.Name, Size: int64(item.Size), Modified: item.Time, Dir: item.Type == ftp.EntryTypeFolder}
		if !entry.Dir && !s.conn.IsTimePreciseInList() {
			if at, err := s.conn.GetTime(path.Join(dir, entry.Name)); err == nil {
				entry.Modified = at
			}
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

func (s *ftpSession) Fetch(ctx context.Context, file string, offset, length int64, w io.Writer) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if length == 0 {
		return nil
	}
	response, err := s.conn.RetrFrom(file, uint64(offset))
	if err != nil {
		return err
	}
	_, err = io.CopyN(w, response, length)
	s.sockets.close()
	response.Close()
	return err
}
func (s *ftpSession) Close() error { s.stop(); s.sockets.close(); return s.conn.Quit() }
