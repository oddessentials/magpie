package serverlog

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

type LaunchSpec struct {
	Command string
	Args    []string
	Dir     string
	Env     []string
	Output  io.Writer
}

type Process interface {
	Pid() int
	Wait() (int, error)
	Kill() error
	MemoryBytes() (uint64, bool)
	Close() error
}

var (
	prepareCommand = func(cmd *exec.Cmd) {}
	killProcess    = func(process *os.Process) error { return process.Kill() }
	memoryOfPid    = func(pid int) (uint64, bool) { return 0, false }
)

func ResolveLaunch(spec LaunchSpec) (LaunchSpec, bool) {
	base := strings.ToLower(filepath.Base(spec.Command))
	if base != "rsdragonwildsserver.exe" && base != "rsdragonwildsserver.sh" {
		return spec, false
	}
	root := filepath.Dir(spec.Command)
	candidates := []string{
		filepath.Join(root, "RSDragonwilds", "Binaries", "Win64", "RSDragonwildsServer-Win64-Shipping.exe"),
		filepath.Join(root, "RSDragonwilds", "Binaries", "Linux", "RSDragonwildsServer-Linux-Shipping"),
	}
	for _, shipping := range candidates {
		if info, err := os.Stat(shipping); err == nil && !info.IsDir() {
			return LaunchSpec{Command: shipping, Args: spec.Args, Dir: filepath.Dir(shipping), Env: spec.Env, Output: spec.Output}, true
		}
	}
	return spec, false
}

func WithLaunchFlags(args []string) ([]string, []string) {
	var added []string
	has := func(name string) bool {
		for _, arg := range args {
			lower := strings.ToLower(strings.TrimLeft(arg, "-"))
			if lower == name || strings.HasPrefix(lower, name+"=") {
				return true
			}
		}
		return false
	}
	out := append([]string(nil), args...)
	for _, flag := range []string{"unattended", "ForceLogFlush"} {
		if !has(strings.ToLower(flag)) {
			out = append(out, "-"+flag)
			added = append(added, "-"+flag)
		}
	}
	return out, added
}

func StartProcess(spec LaunchSpec) (Process, error) {
	if spec.Command == "" {
		return nil, errors.New("launch.command is empty")
	}
	if spec.Dir == "" {
		spec.Dir = filepath.Dir(spec.Command)
	}
	return startExecProcess(spec)
}

type execProcess struct {
	cmd  *exec.Cmd
	code int
	err  error
	done chan struct{}
	once sync.Once
}

func startExecProcess(spec LaunchSpec) (Process, error) {
	cmd := exec.Command(spec.Command, spec.Args...)
	cmd.Dir = spec.Dir
	cmd.Env = append(os.Environ(), spec.Env...)
	if spec.Output != nil {
		cmd.Stdout = spec.Output
		cmd.Stderr = spec.Output
	}
	prepareCommand(cmd)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	process := &execProcess{cmd: cmd, done: make(chan struct{})}
	go func() {
		err := cmd.Wait()
		process.code = cmd.ProcessState.ExitCode()
		process.err = err
		close(process.done)
	}()
	return process, nil
}

func (p *execProcess) Pid() int {
	return p.cmd.Process.Pid
}

func (p *execProcess) Wait() (int, error) {
	<-p.done
	var exitErr *exec.ExitError
	if errors.As(p.err, &exitErr) {
		return p.code, nil
	}
	return p.code, p.err
}

func (p *execProcess) Kill() error {
	select {
	case <-p.done:
		return nil
	default:
	}
	return killProcess(p.cmd.Process)
}

func (p *execProcess) MemoryBytes() (uint64, bool) {
	select {
	case <-p.done:
		return 0, false
	default:
	}
	return memoryOfPid(p.Pid())
}

func (p *execProcess) Close() error {
	return nil
}
