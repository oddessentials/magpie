import argparse
import ctypes
import datetime
import os
import re
import shutil
import subprocess
import sys
import time

import launch

ROOT = os.environ.get('MAGPIE_RIG', r'D:\dragonwilds-rig')
SERVER = os.path.join(ROOT, 'server')
EXE = os.path.join(SERVER, 'RSDragonwilds', 'Binaries', 'Win64', 'RSDragonwildsServer-Win64-Shipping.exe')
SAVED = os.path.join(SERVER, 'RSDragonwilds', 'Saved')
LOG = os.path.join(SAVED, 'Logs', 'RSDragonwilds.log')
HELPER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'console_helper.py')
INTERESTING = re.compile(r'Login|Logout|joined|left|Disconnect|Marked|Death|Respawn|Sav|Backup|Owner|ServerName|WorldName|Password|MaxPlayers|Port|Beacon|Session|EOS_|Anti|Error|Warning|Fatal|Exit|Shutdown|DedicatedServer|UE4SS|Magpie', re.I)


def console(action, pid):
    result = subprocess.run([sys.executable, HELPER, action, str(pid)], creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True, text=True, timeout=40)
    text = (result.stdout.strip() or result.stderr.strip())[:200]
    print('console %s: %s' % (action, text), flush=True)
    return text


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


def snapshot(session, ue4ss):
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
    if ue4ss:
        folder = os.path.dirname(ue4ss)
        for name in ('UE4SS.log', 'magpie-probe.txt'):
            source = os.path.join(folder, name)
            if os.path.exists(source):
                shutil.copy2(source, os.path.join(session, name))


def wait_exit(handle, seconds):
    deadline = time.time() + seconds
    while time.time() < deadline:
        alive, code = launch.running(handle)
        if not alive:
            return code
        time.sleep(1)
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--minutes', type=float, default=2)
    parser.add_argument('--name', default=None)
    parser.add_argument('--stop-wait', type=int, default=90)
    parser.add_argument('--stop', default='ctrlc', choices=['ctrlc', 'ctrlbreak', 'close', 'kill'])
    parser.add_argument('--ue4ss', default=None)
    parser.add_argument('args', nargs='*')
    opts = parser.parse_args()
    stamp = datetime.datetime.now().strftime('%Y-%m-%d-%H%M%S')
    session = os.path.join(ROOT, 'sessions', opts.name or stamp)
    os.makedirs(session, exist_ok=True)
    if os.path.exists(LOG):
        os.remove(LOG)
    ue4ss = os.path.abspath(opts.ue4ss) if opts.ue4ss else None
    if ue4ss:
        for name in ('UE4SS.log', 'magpie-probe.txt'):
            stale = os.path.join(os.path.dirname(ue4ss), name)
            if os.path.exists(stale):
                os.remove(stale)
    args = [EXE, '-log', '-unattended', '-ForceLogFlush'] + opts.args
    started = time.time()
    pid, handle = launch.start(subprocess.list2cmdline(args), SERVER, ue4ss)
    with open(os.path.join(session, 'pid'), 'w') as f:
        f.write(str(pid))
    print('started pid %d: %s%s' % (pid, ' '.join(args[1:]), ' with ' + ue4ss if ue4ss else ''), flush=True)
    hidden = console('hide', pid)
    hwnd = int(hidden.split()[2]) if hidden.startswith('console window') else 0
    seen = 0
    deadline = started + opts.minutes * 60
    stopped_by = None
    code = None
    peak_mb = 0
    next_sample = started
    while True:
        if time.time() >= next_sample:
            next_sample = time.time() + 30
            sample = working_set_mb(pid)
            if sample:
                peak_mb = max(peak_mb, sample)
                print('  memory %.0f MB' % sample, flush=True)
        seen, lines = tail_new(LOG, seen)
        for line in lines:
            if INTERESTING.search(line):
                print('  ' + line[:220], flush=True)
        alive, code = launch.running(handle)
        if not alive:
            stopped_by = 'exited %d' % code
            break
        if time.time() >= deadline:
            print('time limit reached, stopping with %s' % opts.stop, flush=True)
            if opts.stop == 'close':
                print('close posted %s to window %d' % (bool(ctypes.windll.user32.PostMessageW(hwnd, 0x0010, 0, 0)), hwnd), flush=True)
            elif opts.stop != 'kill':
                console(opts.stop, pid)
            if opts.stop == 'kill':
                launch.terminate(handle)
            code = wait_exit(handle, opts.stop_wait)
            if code is None:
                print('no exit after %d s, terminating' % opts.stop_wait, flush=True)
                launch.terminate(handle)
                code = wait_exit(handle, 30)
            stopped_by = 'stopped by %s' % opts.stop
            break
        time.sleep(2)
    seen, lines = tail_new(LOG, seen)
    for line in lines:
        if INTERESTING.search(line):
            print('  ' + line[:220], flush=True)
    print('%s after %.0f s, exit code %s, peak working set %.0f MB' % (stopped_by, time.time() - started, code, peak_mb), flush=True)
    launch.close(handle)
    snapshot(session, ue4ss)
    try:
        os.remove(os.path.join(session, 'pid'))
    except OSError:
        pass
    print('session recorded in', session, flush=True)


main()
