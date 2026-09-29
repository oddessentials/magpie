package serverlog

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

func init() {
	prepareCommand = func(cmd *exec.Cmd) {
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	}
	killProcess = func(process *os.Process) error {
		if err := syscall.Kill(-process.Pid, syscall.SIGKILL); err != nil {
			return process.Kill()
		}
		return nil
	}
	memoryOfPid = residentMemory
}

func residentMemory(pid int) (uint64, bool) {
	data, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/status")
	if err != nil {
		return 0, false
	}
	for _, line := range strings.Split(string(data), "\n") {
		if !strings.HasPrefix(line, "VmRSS:") {
			continue
		}
		fields := strings.Fields(strings.TrimPrefix(line, "VmRSS:"))
		if len(fields) < 1 {
			return 0, false
		}
		kb, err := strconv.ParseUint(fields[0], 10, 64)
		if err != nil {
			return 0, false
		}
		return kb * 1024, true
	}
	return 0, false
}
