package serverlog

import (
	"os/exec"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

func init() {
	prepareCommand = func(cmd *exec.Cmd) {
		cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: windows.CREATE_NO_WINDOW}
	}
	memoryOfPid = workingSet
}

var (
	kernel32                 = windows.NewLazySystemDLL("kernel32.dll")
	procGetProcessMemoryInfo = kernel32.NewProc("K32GetProcessMemoryInfo")
)

type processMemoryCounters struct {
	cb                         uint32
	pageFaultCount             uint32
	peakWorkingSetSize         uintptr
	workingSetSize             uintptr
	quotaPeakPagedPoolUsage    uintptr
	quotaPagedPoolUsage        uintptr
	quotaPeakNonPagedPoolUsage uintptr
	quotaNonPagedPoolUsage     uintptr
	pagefileUsage              uintptr
	peakPagefileUsage          uintptr
}

func workingSet(pid int) (uint64, bool) {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return 0, false
	}
	defer windows.CloseHandle(handle)
	var counters processMemoryCounters
	counters.cb = uint32(unsafe.Sizeof(counters))
	result, _, _ := procGetProcessMemoryInfo.Call(uintptr(handle), uintptr(unsafe.Pointer(&counters)), uintptr(counters.cb))
	if result == 0 {
		return 0, false
	}
	return uint64(counters.workingSetSize), true
}
