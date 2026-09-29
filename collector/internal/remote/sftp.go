package remote

import (
	"context"
	"errors"
	"io"
	"net"
	"net/url"
	"os"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type sftpSession struct {
	conn  net.Conn
	ssh   *ssh.Client
	files *sftp.Client
	stop  func() bool
}

func dialSFTP(ctx context.Context, target *url.URL, user, password string, opts Options) (*sftpSession, error) {
	if target.User == nil || user == "" {
		return nil, errors.New("SFTP needs a username")
	}
	methods := []ssh.AuthMethod{}
	if opts.KeyFile != "" {
		data, err := os.ReadFile(opts.KeyFile)
		if err != nil {
			return nil, err
		}
		signer, err := ssh.ParsePrivateKey(data)
		var missing *ssh.PassphraseMissingError
		if errors.As(err, &missing) && password != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(data, []byte(password))
		}
		if err != nil {
			return nil, err
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if password != "" {
		methods = append(methods, ssh.Password(password))
	}
	if len(methods) == 0 {
		return nil, errors.New("SFTP needs a password or key")
	}
	port := target.Port()
	if port == "" {
		port = "22"
	}
	address := net.JoinHostPort(target.Hostname(), port)
	dialer := net.Dialer{Timeout: opts.Timeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	if deadline, ok := ctx.Deadline(); ok {
		conn.SetDeadline(deadline)
	}
	check := func(_ string, _ net.Addr, key ssh.PublicKey) error {
		if ssh.FingerprintSHA256(key) != opts.HostKey {
			return errors.New("SFTP host key does not match its pin")
		}
		return nil
	}
	config := &ssh.ClientConfig{User: user, Auth: methods, HostKeyCallback: check, Timeout: opts.Timeout}
	connection, channels, requests, err := ssh.NewClientConn(conn, address, config)
	if err != nil {
		stop()
		conn.Close()
		return nil, err
	}
	client := ssh.NewClient(connection, channels, requests)
	files, err := sftp.NewClient(client)
	if err != nil {
		stop()
		client.Close()
		return nil, err
	}
	return &sftpSession{conn: conn, ssh: client, files: files, stop: stop}, nil
}

func (s *sftpSession) List(ctx context.Context, dir string) ([]Entry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	infos, err := s.files.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	entries := []Entry{}
	for _, info := range infos {
		if info.Mode()&os.ModeSymlink != 0 {
			continue
		}
		entries = append(entries, Entry{Name: info.Name(), Size: info.Size(), Modified: info.ModTime(), Dir: info.IsDir()})
	}
	return entries, nil
}

func (s *sftpSession) Fetch(ctx context.Context, file string, offset, length int64, w io.Writer) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	fileHandle, err := s.files.Open(file)
	if err != nil {
		return err
	}
	defer fileHandle.Close()
	if _, err := fileHandle.Seek(offset, io.SeekStart); err != nil {
		return err
	}
	_, err = io.CopyN(w, fileHandle, length)
	return err
}
func (s *sftpSession) Close() error {
	s.stop()
	s.conn.Close()
	return errors.Join(s.files.Close(), s.ssh.Close())
}
