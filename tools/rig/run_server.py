import argparse
import ctypes
import datetime
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = os.environ.get('MAGPIE_RIG', r'D:\dragonwilds-rig')
SERVER = os.path.join(ROOT, 'server')
EXE = os.path.join(SERVER, 'RSDragonwilds', 'Binaries', 'Win64', 'RSDragonwildsServer-Win64-Shipping.exe')
SAVED = os.path.join(SERVER, 'RSDragonwilds', 'Saved')
LOG = os.path.join(SAVED, 'Logs', 'RSDragonwilds.log')
INTERESTING = re.compile(r'Login|Logout|joined|left|Disconnect|Marked|Death|Respawn|Sav|Backup|Owner|ServerName|WorldName|Password|MaxPlayers|Port|Beacon|Session|EOS_|Anti|Error|Warning|Fatal|Exit|Shutdown|DedicatedServer', re.I)


HELPER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'console_helper.py')


def console(action, pid):
    result = subprocess.run([sys.executable, HELPER, action, str(pid)], creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True, text=True, timeout=40)
    text = (result.stdout.strip() or result.stderr.strip())[:200]
    print('console %s: %s' % (action, text), flush=True)
    return text


def ctrl_c(pid):
    return console('ctrlc', pid)


def working_set_mb(pid):
    result = subprocess.run(['tasklist', '/FI', 'PID eq %d' % pid, '/FO', 'CSV', '/NH'], capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
    parts = result.stdout.strip().strip('"').split('","')
    if len(parts) < 5:
        return None
    digits = ''.join(ch for ch in parts[4] if ch.isdigit())
    return int(digits) / 1024 if digits else None


def tail_new(path, seen):
    if not os.path.exists(path):
        return seen, []
    with open(path, 'rb') as f:
        f.seek(seen)
        chunk = f.read()
    lines = chunk.decode('utf-8', 'replace').splitlines()
    return seen + len(chunk), lines


def snapshot(session):
    target = os.path.join(session, 'Saved')
    if os.path.isdir(SAVED):
        shutil.copytree(SAVED, target, dirs_exist_ok=True, ignore=shutil.ignore_patterns('Crashes', 'Sentry', '*.tmp'))
    listing = []
    for base, dirs, files in os.walk(SAVED):
        for name in files:
            full = os.path.join(base, name)
            listing.append('%10d  %s  %s' % (os.path.getsize(full), datetime.datetime.fromtimestamp(os.path.getmtime(full)).isoformat(timespec='seconds'), os.path.relpath(full, SAVED)))
    with open(os.path.join(session, 'saved-listing.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(sorted(listing, key=lambda l: l.split('  ', 2)[2])) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--minutes', type=float, default=2)
    parser.add_argument('--name', default=None)
    parser.add_argument('--stop-wait', type=int, default=90)
    parser.add_argument('--stop', default='ctrlc', choices=['ctrlc', 'ctrlbreak', 'close', 'kill'])
    parser.add_argument('args', nargs='*')
    opts = parser.parse_args()
    stamp = datetime.datetime.now().strftime('%Y-%m-%d-%H%M%S')
    session = os.path.join(ROOT, 'sessions', opts.name or stamp)
    os.makedirs(session, exist_ok=True)
    if os.path.exists(LOG):
        os.remove(LOG)
    args = [EXE, '-log', '-unattended', '-ForceLogFlush'] + opts.args
    info = subprocess.STARTUPINFO()
    info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    info.wShowWindow = 0
    started = time.time()
    proc = subprocess.Popen(args, cwd=SERVER, creationflags=subprocess.CREATE_NEW_CONSOLE, startupinfo=info, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(os.path.join(session, 'pid'), 'w') as f:
        f.write(str(proc.pid))
    print('started pid %d: %s' % (proc.pid, ' '.join(args[1:])), flush=True)
    hidden = console('hide', proc.pid)
    hwnd = int(hidden.split()[2]) if hidden.startswith('console window') else 0
    seen = 0
    deadline = started + opts.minutes * 60
    stopped_by = None
    peak_mb = 0
    next_sample = started
    while True:
        if time.time() >= next_sample:
            next_sample = time.time() + 30
            sample = working_set_mb(proc.pid)
            if sample:
                peak_mb = max(peak_mb, sample)
                print('  memory %.0f MB' % sample, flush=True)
        seen, lines = tail_new(LOG, seen)
        for line in lines:
            if INTERESTING.search(line):
                print('  ' + line[:220], flush=True)
        code = proc.poll()
        if code is not None:
            stopped_by = 'exited %d' % code
            break
        if time.time() >= deadline:
            stopped_by = 'time limit'
            print('time limit reached, stopping with %s' % opts.stop, flush=True)
            if opts.stop == 'close':
                print('close posted %s to window %d' % (bool(ctypes.windll.user32.PostMessageW(hwnd, 0x0010, 0, 0)), hwnd), flush=True)
            elif opts.stop != 'kill':
                console(opts.stop, proc.pid)
            if opts.stop == 'kill':
                proc.terminate()
            try:
                proc.wait(timeout=opts.stop_wait)
                stopped_by = 'stopped by %s' % opts.stop
            except subprocess.TimeoutExpired:
                print('no exit after %d s, terminating' % opts.stop_wait, flush=True)
                proc.terminate()
                proc.wait()
            break
        time.sleep(2)
    seen, lines = tail_new(LOG, seen)
    for line in lines:
        if INTERESTING.search(line):
            print('  ' + line[:220], flush=True)
    print('%s after %.0f s, exit code %s, peak working set %.0f MB' % (stopped_by, time.time() - started, proc.returncode, peak_mb), flush=True)
    snapshot(session)
    try:
        os.remove(os.path.join(session, 'pid'))
    except OSError:
        pass
    print('session recorded in', session, flush=True)


main()
