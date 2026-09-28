import ctypes
import sys
import time

kernel32 = ctypes.windll.kernel32
user32 = ctypes.windll.user32


def attach(pid, tries):
    kernel32.FreeConsole()
    for _ in range(tries):
        if kernel32.AttachConsole(pid):
            return True
        time.sleep(0.5)
    return False


def main():
    action, pid = sys.argv[1], int(sys.argv[2])
    if not attach(pid, 40 if action == 'hide' else 4):
        print('attach failed', kernel32.GetLastError())
        sys.exit(1)
    if action == 'hide':
        window = kernel32.GetConsoleWindow()
        print('console window', window, 'hidden', bool(user32.ShowWindow(window, 0)) if window else False)
    elif action in ('ctrlc', 'ctrlbreak'):
        kernel32.SetConsoleCtrlHandler(None, True)
        sent = kernel32.GenerateConsoleCtrlEvent(0 if action == 'ctrlc' else 1, 0)
        print(action, 'sent', bool(sent))
        time.sleep(1)
        sys.exit(0 if sent else 1)
    elif action == 'close':
        window = kernel32.GetConsoleWindow()
        posted = user32.PostMessageW(window, 0x0010, 0, 0) if window else 0
        print('close posted', bool(posted))
        sys.exit(0 if posted else 1)
    kernel32.FreeConsole()


main()
