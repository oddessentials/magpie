package remote

import (
	"bufio"
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/oddessentials/magpie/collector/internal/remote/remotetest"
	"golang.org/x/crypto/ssh"
)

const testUser = "dragonwilds"
const testPassword = "fixture-password"

var saved = time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)

type ftpServer struct {
	root      string
	listener  net.Listener
	mu        sync.Mutex
	commands  []string
	tlsConfig *tls.Config
	offsets   []int64
}

func startFTP(t *testing.T, root string, secure *tls.Config) *ftpServer {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &ftpServer{root: root, listener: listener, tlsConfig: secure}
	t.Cleanup(func() { listener.Close() })
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go server.serve(conn)
		}
	}()
	return server
}

func (s *ftpServer) local(name string) string {
	clean := path.Clean("/" + strings.TrimSpace(name))
	return filepath.Join(s.root, filepath.FromSlash(clean))
}

func (s *ftpServer) serve(conn net.Conn) {
	defer conn.Close()
	reader := bufio.NewReader(conn)
	reply := func(format string, args ...any) { fmt.Fprintf(conn, format+"\r\n", args...) }
	reply("220 test server ready")
	var data net.Listener
	loggedIn := false
	protected := false
	var offset int64
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")
		command, argument, _ := strings.Cut(line, " ")
		command = strings.ToUpper(command)
		s.mu.Lock()
		s.commands = append(s.commands, command)
		s.mu.Unlock()
		switch command {
		case "AUTH":
			if s.tlsConfig == nil {
				reply("502 no TLS")
				continue
			}
			reply("234 start TLS")
			conn = tls.Server(conn, s.tlsConfig)
			reader = bufio.NewReader(conn)
		case "PBSZ":
			reply("200 ok")
		case "PROT":
			protected = argument == "P"
			reply("200 ok")
		case "REST":
			offset, err = strconv.ParseInt(argument, 10, 64)
			if err != nil {
				reply("501 bad offset")
			} else {
				reply("350 offset accepted")
			}
		case "USER":
			reply("331 password please")
		case "PASS":
			if argument != testPassword {
				reply("530 wrong password")
				continue
			}
			loggedIn = true
			reply("230 logged in")
		case "FEAT":
			reply("211-Features:\r\n MLST type*;size*;modify*;\r\n MDTM\r\n UTF8\r\n211 End")
		case "TYPE", "OPTS":
			reply("200 ok")
		case "EPSV":
			data, err = net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				reply("425 no data connection")
				continue
			}
			reply("229 Entering Extended Passive Mode (|||%d|)", data.Addr().(*net.TCPAddr).Port)
		case "MDTM":
			info, err := os.Stat(s.local(argument))
			if err != nil || !loggedIn {
				reply("550 no such file")
				continue
			}
			reply("213 %s", info.ModTime().UTC().Format("20060102150405"))
		case "MLSD", "RETR":
			if data == nil || !loggedIn {
				reply("425 use EPSV first")
				continue
			}
			transfer, err := data.Accept()
			data.Close()
			data = nil
			if err != nil {
				reply("425 no data connection")
				continue
			}
			if protected {
				transfer = tls.Server(transfer, s.tlsConfig)
			}
			if command == "MLSD" {
				entries, err := os.ReadDir(s.local(argument))
				if err != nil {
					transfer.Close()
					reply("550 no such folder")
					continue
				}
				reply("150 listing")
				for _, entry := range entries {
					info, _ := entry.Info()
					kind := "file"
					if entry.IsDir() {
						kind = "dir"
					}
					fmt.Fprintf(transfer, "type=%s;size=%d;modify=%s; %s\r\n", kind, info.Size(), info.ModTime().UTC().Format("20060102150405"), entry.Name())
				}
			} else {
				file, err := os.Open(s.local(argument))
				if err != nil {
					transfer.Close()
					reply("550 no such file")
					continue
				}
				reply("150 sending")
				file.Seek(offset, io.SeekStart)
				s.mu.Lock()
				s.offsets = append(s.offsets, offset)
				s.mu.Unlock()
				offset = 0
				io.Copy(transfer, file)
				file.Close()
			}
			transfer.Close()
			reply("226 done")
		case "QUIT":
			reply("221 bye")
			return
		default:
			reply("502 not implemented")
		}
	}
}

func certificate(t *testing.T) (*tls.Config, *tls.Config) {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{SerialNumber: big.NewInt(1), NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), IPAddresses: []net.IP{net.ParseIP("127.0.0.1")}, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, template, template, public, private)
	if err != nil {
		t.Fatal(err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	roots := x509.NewCertPool()
	roots.AddCert(cert)
	return &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: private}}, MinVersion: tls.VersionTLS12}, &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}
}

func saveBytes(body string) []byte {
	raw := make([]byte, 8+len(body))
	copy(raw, "SAVE")
	binary.LittleEndian.PutUint32(raw[4:], uint32(len(body)))
	copy(raw[8:], body)
	return raw
}

func TestProtocolsReadRangesAndPublishValidatedSaves(t *testing.T) {
	for _, protocol := range []string{"ftp", "ftps", "sftp"} {
		t.Run(protocol, func(t *testing.T) {
			root := t.TempDir()
			file := filepath.Join(root, "world.sav")
			raw := saveBytes("complete world data")
			if err := os.WriteFile(file, raw, 0600); err != nil {
				t.Fatal(err)
			}
			os.Chtimes(file, saved, saved)
			opts := Options{Password: testPassword, Timeout: 3 * time.Second}
			var server *ftpServer
			if protocol == "sftp" {
				key := remotetest.HostKey(t)
				opts.HostKey = ssh.FingerprintSHA256(key.PublicKey())
				address := remotetest.StartSFTP(t, root, testUser, testPassword, key)
				opts.URL = "sftp://" + testUser + "@" + address + "/~/world.sav"
			} else {
				var serverTLS *tls.Config
				if protocol == "ftps" {
					serverTLS, opts.TLSConfig = certificate(t)
				}
				server = startFTP(t, root, serverTLS)
				opts.URL = protocol + "://" + testUser + "@" + server.listener.Addr().String() + "/world.sav"
			}
			c, err := New(opts)
			if err != nil {
				t.Fatal(err)
			}
			entry, err := c.Stat(context.Background())
			if err != nil || entry.Size != int64(len(raw)) || !entry.Modified.Equal(saved) {
				t.Fatalf("stat %+v %v", entry, err)
			}
			var selected bytes.Buffer
			if err := c.Read(context.Background(), 8, 8, &selected); err != nil || selected.String() != "complete" {
				t.Fatalf("range %q %v", selected.String(), err)
			}
			destination := filepath.Join(t.TempDir(), "published.sav")
			validated := false
			_, err = c.Save(context.Background(), destination, func(file string) error {
				data, err := os.ReadFile(file)
				if err != nil {
					return err
				}
				if !bytes.Equal(data, raw) {
					return errors.New("wrong complete data")
				}
				info, err := os.Stat(file)
				if err != nil {
					return err
				}
				if !info.ModTime().Equal(saved) {
					return errors.New("source time was replaced by download time")
				}
				validated = true
				return nil
			})
			if err != nil || !validated {
				t.Fatalf("save %v validated %v", err, validated)
			}
			data, _ := os.ReadFile(destination)
			if !bytes.Equal(data, raw) {
				t.Fatal("wrong published data")
			}
			if server != nil {
				server.mu.Lock()
				offsets := append([]int64(nil), server.offsets...)
				commands := strings.Join(server.commands, " ")
				server.mu.Unlock()
				if len(offsets) < 2 || offsets[0] != 8 {
					t.Fatalf("REST offset not used: %v", offsets)
				}
				if protocol == "ftps" && (!strings.Contains(commands, "AUTH") || !strings.Contains(commands, "PROT")) {
					t.Fatal("FTPS did not negotiate protected transfers")
				}
			}
			changed := opts
			changed.Password = "wrong"
			bad, _ := New(changed)
			if _, err := bad.Stat(context.Background()); err == nil {
				t.Fatal("accepted incorrect credentials")
			}
			if protocol == "sftp" {
				changed = opts
				changed.HostKey = ssh.FingerprintSHA256(remotetest.HostKey(t).PublicKey())
				bad, _ = New(changed)
				if _, err := bad.Stat(context.Background()); err == nil {
					t.Fatal("accepted changed host key")
				}
			}
			if protocol == "ftps" {
				changed = opts
				changed.TLSConfig = nil
				bad, _ = New(changed)
				if _, err := bad.Stat(context.Background()); err == nil {
					t.Fatal("accepted an untrusted TLS certificate")
				}
			}
		})
	}
}

type fakeSession struct {
	data    []byte
	size    int64
	changed bool
	lists   int
}

func (s *fakeSession) List(context.Context, string) ([]Entry, error) {
	s.lists++
	size := s.size
	if s.changed && s.lists > 1 {
		size++
	}
	return []Entry{{Name: "world.sav", Size: size, Modified: saved}}, nil
}
func (s *fakeSession) Fetch(_ context.Context, _ string, offset, length int64, w io.Writer) error {
	_, err := io.CopyN(w, bytes.NewReader(s.data[offset:]), length)
	return err
}
func (s *fakeSession) Close() error { return nil }

func TestFailedSaveNeverReplacesTheLastValidatedCopy(t *testing.T) {
	for _, kind := range []string{"partial", "changing", "invalid-header", "invalid-body", "no-validator"} {
		t.Run(kind, func(t *testing.T) {
			raw := saveBytes("new contents")
			fake := &fakeSession{data: raw, size: int64(len(raw))}
			validator := func(string) error { return nil }
			switch kind {
			case "partial":
				fake.data = raw[:len(raw)-1]
			case "changing":
				fake.changed = true
			case "invalid-header":
				fake.data[4]++
			case "invalid-body":
				validator = func(string) error { return errors.New("unsupported SPUD object") }
			case "no-validator":
				validator = nil
			}
			client, _ := New(Options{URL: "ftp://fixture.invalid/world.sav"})
			client.open = func(context.Context) (session, error) { return fake, nil }
			destination := filepath.Join(t.TempDir(), "world.sav")
			os.WriteFile(destination, []byte("last complete save"), 0600)
			if _, err := client.Save(context.Background(), destination, validator); err == nil {
				t.Fatal("invalid save accepted")
			}
			data, _ := os.ReadFile(destination)
			if string(data) != "last complete save" {
				t.Fatal("old save was replaced")
			}
			entries, _ := os.ReadDir(filepath.Dir(destination))
			if len(entries) != 1 {
				t.Fatal("partial download was left behind")
			}
		})
	}
}

func TestRemoteValidationAndIdentityDoNotExposeCredentials(t *testing.T) {
	for _, raw := range []string{"https://user:private@host/file", "ftp://user:private@host/", "sftp://user:private@host/world.sav", "ftp://user:private@host/file?secret=private", "ftp://user:private@host/%0Afile"} {
		if _, err := New(Options{URL: raw}); err == nil || strings.Contains(err.Error(), "private") {
			t.Fatalf("validation: %v", err)
		}
	}
	one, _ := New(Options{URL: "ftp://user:first@host/world.sav"})
	two, _ := New(Options{URL: "ftp://user:second@host/world.sav"})
	if one.Identity() != two.Identity() || strings.Contains(one.Identity(), "host") {
		t.Fatal("cursor identity exposes endpoint or depends on its password")
	}
}

func TestStalledHandshakesRespectTimeoutAndCancellation(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	sockets := &connections{}
	defer sockets.close()
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			sockets.add(conn)
		}
	}()
	for _, scheme := range []string{"ftp", "ftps", "sftp"} {
		t.Run(scheme, func(t *testing.T) {
			opts := Options{URL: scheme + "://user@" + listener.Addr().String() + "/world.sav", Password: testPassword, HostKey: "SHA256:fixture", Timeout: 150 * time.Millisecond}
			client, err := New(opts)
			if err != nil {
				t.Fatal(err)
			}
			started := time.Now()
			if _, err := client.Stat(context.Background()); err == nil {
				t.Fatal("stalled handshake succeeded")
			}
			if time.Since(started) > time.Second {
				t.Fatal("handshake ignored timeout")
			}
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			if _, err := client.Stat(ctx); err == nil {
				t.Fatal("canceled operation succeeded")
			}
		})
	}
}
