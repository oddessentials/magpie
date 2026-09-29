import collections
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def session_path(root, name):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', name):
        raise ValueError('session name must contain only letters, digits, underscores and hyphens')
    if re.fullmatch(r'CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]', name, re.I):
        raise ValueError('reserved session name')
    sessions = (Path(root) / 'sessions').resolve()
    result = (sessions / name).resolve()
    if result.parent != sessions:
        raise ValueError('session must stay within the sessions directory')
    return result


def write_manifest(session, manifest):
    temporary = session / 'recording.json.tmp'
    temporary.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    temporary.replace(session / 'recording.json')


def request_stop(root, name):
    session = session_path(root, name)
    manifest = json.loads((session / 'recording.json').read_text(encoding='utf-8'))
    if manifest.get('mode') != 'untimed' or manifest.get('phase') != 'recording':
        raise ValueError('session is not an active untimed recording')
    if (session / 'pid').read_text().strip() != str(manifest.get('pid')):
        raise ValueError('recording process marker does not match')
    try:
        with (session / 'magpie-stop.txt').open('x', encoding='utf-8') as target:
            target.write('stop\n')
    except FileExistsError:
        return False
    return True


class CaptureFile:
    def __init__(self, source, destination):
        self.source = Path(source)
        self.destination = Path(destination)
        self.offset = 0
        self.identity = None
        self.witness = b''
        self.segment = 0

    def poll(self):
        try:
            source = self.source.open('rb')
        except FileNotFoundError:
            return
        with source:
            stat = os.fstat(source.fileno())
            identity = (stat.st_dev, stat.st_ino)
            source.seek(max(0, self.offset - len(self.witness)))
            changed = source.read(len(self.witness)) != self.witness
            if self.identity is not None and (identity != self.identity or stat.st_size < self.offset or changed):
                self.segment += 1
                self.destination.rename(self.destination.with_name(self.destination.name + '.%03d' % self.segment))
                self.offset = 0
            source.seek(self.offset)
            with self.destination.open('ab') as target:
                shutil.copyfileobj(source, target)
                target.flush()
                os.fsync(target.fileno())
            self.offset = source.tell()
            source.seek(max(0, self.offset - 64))
            self.witness = source.read(64)
            self.identity = identity


def record_until_exit(running, poll, stop, pause=time.sleep):
    requested = False
    while True:
        try:
            poll()
            alive, code = running()
            if not alive:
                poll()
                return code
            pause(1)
        except KeyboardInterrupt:
            if not requested:
                stop()
                requested = True


def audit(session, mod_source):
    session = Path(session)
    hooks = set(re.findall(r'^hook\("([^"\n]+)"', Path(mod_source).read_text(encoding='utf-8'), re.M))
    logs = sorted(session.glob('UE4SS.log*'))
    text = '\n'.join(path.read_text(encoding='utf-8', errors='replace') for path in logs)
    registered = set(re.findall(r'\[MagpieEvents\] (\S+) hooked', text))
    failed = set(re.findall(r'\[MagpieEvents\] (\S+) handler failed:', text))
    counts = collections.Counter()
    malformed = 0
    events = session / 'magpie-events.jsonl'
    stopped = False
    saving = False
    saved = False
    quit_after_save = False
    lifecycle_failed = False
    nested_chat = False
    if events.exists():
        with events.open(encoding='utf-8') as records:
            for line in records:
                try:
                    event = json.loads(line)
                    if not isinstance(event, dict) or event.get('v') != 1 or not isinstance(event.get('type'), str):
                        raise ValueError('invalid envelope')
                except ValueError:
                    malformed += 1
                    continue
                kind = event['type']
                counts[kind] += 1
                if kind == 'stop_requested':
                    stopped = True
                elif kind == 'save_requested' and stopped:
                    saving = True
                elif kind == 'save_done' and saving and event.get('bSuccess') is True:
                    saved = True
                elif kind == 'quit' and saved:
                    quit_after_save = True
                elif kind in ('save_failed', 'quit_failed'):
                    lifecycle_failed = True
                elif kind == 'chat':
                    message = event.get('ChatMessageData')
                    filters = event.get('ChatPlayerFilterData')
                    nested_chat = nested_chat or (
                        isinstance(message, dict) and isinstance(message.get('MessageBody'), str)
                        and isinstance(message.get('SenderData'), dict) and isinstance(filters, dict)
                        and 'SenderId' in filters and 'ReceiverIds' in filters
                    )
    return {
        'configured_hooks': len(hooks),
        'registered_hooks': len(hooks & registered),
        'missing_hooks': sorted(hooks - registered),
        'handler_failures': sorted(hooks & failed),
        'events': dict(sorted(counts.items())),
        'malformed_records': malformed,
        'nested_chat_serialized': nested_chat,
        'save_then_quit': quit_after_save and not lifecycle_failed and malformed == 0,
    }


def preflight(root, ue4ss, repo):
    root, ue4ss, repo = Path(root), Path(ue4ss), Path(repo)
    server = root / 'server'
    required = [
        server / 'RSDragonwilds/Binaries/Win64/RSDragonwildsServer-Win64-Shipping.exe',
        ue4ss,
        ue4ss.parent / 'Mods/MagpieEvents/enabled.txt',
        ue4ss.parent / 'Mods/MagpieEvents/Scripts/main.lua',
    ]
    if any(not path.is_file() for path in required):
        raise ValueError('server, UE4SS or enabled MagpieEvents is missing')
    source = repo / 'mod/MagpieEvents/Scripts/main.lua'
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if hashlib.sha256(required[-1].read_bytes()).hexdigest() != digest:
        raise ValueError('installed MagpieEvents differs from the repository')
    build = json.loads((repo / 'web/src/lib/world/build.json').read_text(encoding='utf-8'))
    manifest = (server / 'steamapps/appmanifest_4019830.acf').read_text(encoding='utf-8')
    match = re.search(r'"buildid"\s+"(\d+)"', manifest)
    if match is None or int(match[1]) != build['server_build']:
        raise ValueError('installed server build differs from recorded facts')
    return {'server_build': build['server_build'], 'game_version': build['version'], 'mod_sha256': digest}


def run(root, ue4ss, name, args, repo):
    import launch

    root, ue4ss, repo = Path(root), Path(ue4ss).resolve(), Path(repo)
    evidence = preflight(root, ue4ss, repo)
    processes = subprocess.run(
        ['tasklist', '/FI', 'IMAGENAME eq RSDragonwildsServer-Win64-Shipping.exe', '/FO', 'CSV', '/NH'],
        capture_output=True, text=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW,
    )
    if 'RSDragonwildsServer-Win64-Shipping.exe'.lower() in processes.stdout.lower():
        raise ValueError('a rig server is already running')
    session = session_path(root, name)
    session.mkdir(parents=True, exist_ok=False)
    server = root / 'server'
    saved = server / 'RSDragonwilds/Saved'
    log = saved / 'Logs/RSDragonwilds.log'
    if (saved / 'SaveGames').is_dir():
        shutil.copytree(saved / 'SaveGames', session / 'before/SaveGames')
    for path in (log, ue4ss.parent / 'UE4SS.log'):
        if path.exists():
            shutil.copy2(path, session / ('before-' + path.name))
            path.unlink()
    os.environ['MAGPIE_EVENTS_FILE'] = str(session / 'magpie-events.jsonl')
    os.environ['MAGPIE_STOP_FILE'] = str(session / 'magpie-stop.txt')
    os.environ['MAGPIE_PROBE_FILE'] = str(session / 'magpie-probe.txt')
    manifest = {'mode': 'untimed', 'phase': 'starting', 'started_at': timestamp(), **evidence}
    write_manifest(session, manifest)
    command = [str(server / 'RSDragonwilds/Binaries/Win64/RSDragonwildsServer-Win64-Shipping.exe'), '-log', '-unattended', '-ForceLogFlush', *args]
    pid, handle = launch.start(subprocess.list2cmdline(command), str(server), str(ue4ss))
    manifest.update(phase='recording', pid=pid)
    (session / 'pid').write_text(str(pid), encoding='utf-8')
    write_manifest(session, manifest)
    captures = [CaptureFile(log, session / 'server.log'), CaptureFile(ue4ss.parent / 'UE4SS.log', session / 'UE4SS.log')]
    print('Untimed recording started. Request a save and quit with --request-stop %s.' % name, flush=True)

    def poll():
        for capture in captures:
            capture.poll()

    def stop():
        request_stop(root, name)
        print('Save and quit requested; recording continues until the server exits.', flush=True)

    try:
        code = record_until_exit(lambda: launch.running(handle), poll, stop)
    finally:
        launch.close(handle)
    if saved.is_dir():
        shutil.copytree(saved, session / 'Saved', ignore=shutil.ignore_patterns('Crashes', 'Sentry', '*.tmp'))
    report = audit(session, repo / 'mod/MagpieEvents/Scripts/main.lua')
    verified = code == 0 and report['save_then_quit']
    manifest.update(phase='finished', finished_at=timestamp(), exit_code=code, graceful_save_verified=verified, audit=report)
    write_manifest(session, manifest)
    (session / 'pid').unlink()
    print('Recording finished: %s.' % ('save and quit verified' if verified else 'shutdown needs review'), flush=True)
    return 0 if verified else 1
