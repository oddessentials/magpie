import ctypes
from ctypes import wintypes

kernel32 = ctypes.windll.kernel32

CREATE_SUSPENDED = 0x00000004
CREATE_NEW_CONSOLE = 0x00000010
MEM_COMMIT = 0x1000
MEM_RESERVE = 0x2000
PAGE_READWRITE = 0x04
STARTF_USESHOWWINDOW = 0x00000001
STILL_ACTIVE = 259


class StartupInfo(ctypes.Structure):
    _fields_ = [
        ('cb', wintypes.DWORD),
        ('lpReserved', wintypes.LPWSTR),
        ('lpDesktop', wintypes.LPWSTR),
        ('lpTitle', wintypes.LPWSTR),
        ('dwX', wintypes.DWORD),
        ('dwY', wintypes.DWORD),
        ('dwXSize', wintypes.DWORD),
        ('dwYSize', wintypes.DWORD),
        ('dwXCountChars', wintypes.DWORD),
        ('dwYCountChars', wintypes.DWORD),
        ('dwFillAttribute', wintypes.DWORD),
        ('dwFlags', wintypes.DWORD),
        ('wShowWindow', wintypes.WORD),
        ('cbReserved2', wintypes.WORD),
        ('lpReserved2', ctypes.c_void_p),
        ('hStdInput', wintypes.HANDLE),
        ('hStdOutput', wintypes.HANDLE),
        ('hStdError', wintypes.HANDLE),
    ]


class ProcessInformation(ctypes.Structure):
    _fields_ = [
        ('hProcess', wintypes.HANDLE),
        ('hThread', wintypes.HANDLE),
        ('dwProcessId', wintypes.DWORD),
        ('dwThreadId', wintypes.DWORD),
    ]


kernel32.CreateProcessW.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, wintypes.BOOL, wintypes.DWORD, ctypes.c_void_p, wintypes.LPCWSTR, ctypes.POINTER(StartupInfo), ctypes.POINTER(ProcessInformation)]
kernel32.CreateProcessW.restype = wintypes.BOOL
kernel32.VirtualAllocEx.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_size_t, wintypes.DWORD, wintypes.DWORD]
kernel32.VirtualAllocEx.restype = ctypes.c_void_p
kernel32.WriteProcessMemory.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]
kernel32.WriteProcessMemory.restype = wintypes.BOOL
kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
kernel32.GetModuleHandleW.restype = ctypes.c_void_p
kernel32.GetProcAddress.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
kernel32.GetProcAddress.restype = ctypes.c_void_p
kernel32.QueueUserAPC.argtypes = [ctypes.c_void_p, wintypes.HANDLE, ctypes.c_void_p]
kernel32.QueueUserAPC.restype = wintypes.DWORD
kernel32.ResumeThread.argtypes = [wintypes.HANDLE]
kernel32.ResumeThread.restype = wintypes.DWORD
kernel32.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
kernel32.GetExitCodeProcess.restype = wintypes.BOOL
kernel32.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
kernel32.TerminateProcess.restype = wintypes.BOOL
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
kernel32.CloseHandle.restype = wintypes.BOOL


def start(command_line, cwd, dll=None):
    info = StartupInfo()
    info.cb = ctypes.sizeof(info)
    info.dwFlags = STARTF_USESHOWWINDOW
    info.wShowWindow = 0
    process = ProcessInformation()
    flags = CREATE_NEW_CONSOLE | (CREATE_SUSPENDED if dll else 0)
    command = ctypes.create_unicode_buffer(command_line)
    if not kernel32.CreateProcessW(None, command, None, None, False, flags, None, cwd, ctypes.byref(info), ctypes.byref(process)):
        raise OSError(ctypes.get_last_error() or kernel32.GetLastError(), 'CreateProcessW failed')
    if dll:
        path = (dll + '\0').encode('utf-16-le')
        remote = kernel32.VirtualAllocEx(process.hProcess, None, len(path), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE)
        written = ctypes.c_size_t(0)
        if not remote or not kernel32.WriteProcessMemory(process.hProcess, remote, path, len(path), ctypes.byref(written)):
            kernel32.TerminateProcess(process.hProcess, 1)
            raise OSError('writing the DLL path into the server process failed')
        load_library = kernel32.GetProcAddress(kernel32.GetModuleHandleW('kernel32.dll'), b'LoadLibraryW')
        if not kernel32.QueueUserAPC(load_library, process.hThread, remote):
            kernel32.TerminateProcess(process.hProcess, 1)
            raise OSError('queueing the DLL load on the main thread failed')
        kernel32.ResumeThread(process.hThread)
    kernel32.CloseHandle(process.hThread)
    return process.dwProcessId, process.hProcess


def running(handle):
    code = wintypes.DWORD(0)
    kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
    return code.value == STILL_ACTIVE, code.value


def terminate(handle):
    kernel32.TerminateProcess(handle, 1)


def close(handle):
    kernel32.CloseHandle(handle)
