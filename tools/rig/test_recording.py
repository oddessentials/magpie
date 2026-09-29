import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

import recording
import run_server


class RecordingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def write(self, relative, contents):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents, encoding='utf-8')
        return path

    def active(self):
        session = recording.session_path(self.root, 'play-one')
        session.mkdir(parents=True)
        recording.write_manifest(session, {'mode': 'untimed', 'phase': 'recording', 'pid': 123})
        (session / 'pid').write_text('123')
        return session

    def test_waits_without_deadline_and_survives_duplicate_interrupts(self):
        state = {'polls': 0, 'stops': 0, 'pauses': 0}

        def poll():
            state['polls'] += 1

        def stop():
            state['stops'] += 1

        def pause(seconds):
            state['pauses'] += 1
            if state['pauses'] in (100, 200, 300):
                raise KeyboardInterrupt()

        code = recording.record_until_exit(lambda: (state['polls'] < 10000, 7), poll, stop, pause)
        self.assertEqual(code, 7)
        self.assertEqual(state, {'polls': 10001, 'stops': 1, 'pauses': 9999})

    def test_external_stop_does_not_end_recording(self):
        session = self.active()
        state = {'polls': 0}

        def poll():
            state['polls'] += 1
            if state['polls'] == 2:
                recording.request_stop(self.root, 'play-one')

        code = recording.record_until_exit(lambda: (state['polls'] < 100, 0), poll, self.fail, lambda _: None)
        self.assertEqual(code, 0)
        self.assertEqual(state['polls'], 101)
        self.assertTrue((session / 'magpie-stop.txt').exists())

    def test_stop_is_idempotent_and_requires_matching_active_session(self):
        session = self.active()
        self.assertTrue(recording.request_stop(self.root, 'play-one'))
        self.assertFalse(recording.request_stop(self.root, 'play-one'))
        (session / 'pid').write_text('456')
        with self.assertRaises(ValueError):
            recording.request_stop(self.root, 'play-one')
        recording.write_manifest(session, {'mode': 'untimed', 'phase': 'finished', 'pid': 456})
        with self.assertRaises(ValueError):
            recording.request_stop(self.root, 'play-one')
        with self.assertRaises(FileNotFoundError):
            recording.request_stop(self.root, 'unknown')

    def test_rejects_escaping_or_reserved_names(self):
        for name in ('../other', '..', '/absolute', 'C:\\elsewhere', '', 'a/b', 'NUL', 'con', 'LPT1'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                recording.session_path(self.root, name)

    def test_capture_keeps_partial_bytes_and_rotation_segments(self):
        source = self.root / 'source.log'
        target = self.root / 'captured.log'
        capture = recording.CaptureFile(source, target)
        capture.poll()
        source.write_bytes(b'one\npart')
        capture.poll()
        with source.open('ab') as stream:
            stream.write(b'ial\n')
        capture.poll()
        capture.poll()
        self.assertEqual(target.read_bytes(), b'one\npartial\n')
        source.write_bytes(b'x')
        capture.poll()
        self.assertEqual(target.read_bytes(), b'x')
        self.assertEqual((self.root / 'captured.log.001').read_bytes(), b'one\npartial\n')
        source.rename(self.root / 'old.log')
        source.write_bytes(b'new\n')
        capture.poll()
        self.assertEqual(target.read_bytes(), b'new\n')
        self.assertEqual((self.root / 'captured.log.002').read_bytes(), b'x')

    def test_capture_detects_truncation_followed_by_regrowth(self):
        source = self.root / 'source.log'
        target = self.root / 'captured.log'
        capture = recording.CaptureFile(source, target)
        source.write_bytes(b'first\n')
        capture.poll()
        source.write_bytes(b'second and longer\n')
        capture.poll()
        self.assertEqual(target.read_bytes(), b'second and longer\n')
        self.assertEqual((self.root / 'captured.log.001').read_bytes(), b'first\n')

    def audit_fixture(self, events, log='[MagpieEvents] /Script/Test:Save hooked\n'):
        source = self.write('main.lua', 'hook("/Script/Test:Save", "save_done")\n')
        self.write('UE4SS.log', log)
        self.write('magpie-events.jsonl', '\n'.join(json.dumps({'v': 1, **event}) for event in events) + '\n')
        return recording.audit(self.root, source)

    def lifecycle(self):
        return [{'type': 'stop_requested'}, {'type': 'save_requested'}, {'type': 'save_done', 'bSuccess': True}, {'type': 'quit'}]

    def test_audit_distinguishes_registration_serialization_and_shutdown(self):
        events = self.lifecycle() + [{
            'type': 'chat', 'ChatMessageData': {'MessageBody': 'private sample', 'SenderData': {'PlayerId': 'private-player'}},
            'ChatPlayerFilterData': {'SenderId': 'private-player', 'ReceiverIds': []},
        }]
        report = self.audit_fixture(events)
        self.assertEqual(report['registered_hooks'], 1)
        self.assertTrue(report['save_then_quit'])
        self.assertTrue(report['nested_chat_serialized'])
        self.assertNotIn('private', json.dumps(report))

    def test_audit_does_not_treat_failed_or_out_of_order_save_as_verified(self):
        cases = [
            [{'type': 'save_done', 'bSuccess': True}, {'type': 'stop_requested'}, {'type': 'save_requested'}, {'type': 'quit'}],
            [{'type': 'stop_requested'}, {'type': 'save_requested'}, {'type': 'save_done', 'bSuccess': False}, {'type': 'quit'}],
            self.lifecycle() + [{'type': 'quit_failed'}],
        ]
        for events in cases:
            with self.subTest(events=events):
                self.assertFalse(self.audit_fixture(events)['save_then_quit'])

    def test_audit_reports_missing_registration_handlers_and_partial_records(self):
        self.audit_fixture(self.lifecycle(), '[MagpieEvents] /Script/Test:Save handler failed: private value\n')
        with (self.root / 'magpie-events.jsonl').open('a') as stream:
            stream.write('{"partial":')
        report = recording.audit(self.root, self.root / 'main.lua')
        self.assertEqual(report['missing_hooks'], ['/Script/Test:Save'])
        self.assertEqual(report['handler_failures'], ['/Script/Test:Save'])
        self.assertEqual(report['malformed_records'], 1)
        self.assertFalse(report['save_then_quit'])
        self.assertNotIn('private value', json.dumps(report))

    def rig_fixture(self):
        self.write('server/RSDragonwilds/Binaries/Win64/RSDragonwildsServer-Win64-Shipping.exe', '')
        self.write('server/steamapps/appmanifest_4019830.acf', '"buildid" "123"')
        self.write('repo/web/src/lib/world/build.json', '{"server_build":123,"version":"test"}')
        self.write('repo/mod/MagpieEvents/Scripts/main.lua', 'hook("/Script/Test:Save", "save_done")')
        self.write('ue4ss/Mods/MagpieEvents/Scripts/main.lua', 'hook("/Script/Test:Save", "save_done")')
        self.write('ue4ss/Mods/MagpieEvents/enabled.txt', '')
        self.write('ue4ss/UE4SS.dll', '')
        return self.root / 'ue4ss/UE4SS.dll', self.root / 'repo'

    def test_preflight_rejects_changed_mod_build_and_disabled_mod(self):
        dll, repo = self.rig_fixture()
        self.assertEqual(recording.preflight(self.root, dll, repo)['server_build'], 123)
        mod = self.root / 'ue4ss/Mods/MagpieEvents/Scripts/main.lua'
        original = mod.read_text()
        mod.write_text('changed')
        with self.assertRaisesRegex(ValueError, 'differs'):
            recording.preflight(self.root, dll, repo)
        mod.write_text(original)
        manifest = self.root / 'server/steamapps/appmanifest_4019830.acf'
        manifest.write_text('"buildid" "456"')
        with self.assertRaisesRegex(ValueError, 'build differs'):
            recording.preflight(self.root, dll, repo)
        manifest.write_text('"buildid" "123"')
        (dll.parent / 'Mods/MagpieEvents/enabled.txt').unlink()
        with self.assertRaisesRegex(ValueError, 'missing'):
            recording.preflight(self.root, dll, repo)

    def test_untimed_run_records_before_after_and_never_forces_exit(self):
        dll, repo = self.rig_fixture()
        save = self.write('server/RSDragonwilds/Saved/SaveGames/world.sav', 'before')
        self.write('server/RSDragonwilds/Saved/Logs/RSDragonwilds.log', 'old log')
        session = recording.session_path(self.root, 'play-one')
        closed = []

        def start(command, directory, injection):
            self.assertEqual(injection, str(dll.resolve()))
            self.assertIn('Server-Win64-Shipping.exe', command)
            self.assertEqual(Path(os.environ['MAGPIE_EVENTS_FILE']), session / 'magpie-events.jsonl')
            Path(os.environ['MAGPIE_EVENTS_FILE']).write_text('\n'.join(json.dumps({'v': 1, **event}) for event in self.lifecycle()))
            (dll.parent / 'UE4SS.log').write_text('[MagpieEvents] /Script/Test:Save hooked\n')
            (self.root / 'server/RSDragonwilds/Saved/Logs/RSDragonwilds.log').write_text('new log')
            save.write_text('after')
            return 123, 'handle'

        fake = types.SimpleNamespace(start=start, running=lambda _: (False, 0), close=closed.append)
        with patch.dict('sys.modules', {'launch': fake}), patch.dict(os.environ), patch.object(recording.subprocess, 'run', return_value=types.SimpleNamespace(stdout='')), patch.object(recording.subprocess, 'CREATE_NO_WINDOW', 0, create=True), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(recording.run(self.root, dll, 'play-one', [], repo), 0)
            with self.assertRaises(FileExistsError):
                recording.run(self.root, dll, 'play-one', [], repo)
        manifest = json.loads((session / 'recording.json').read_text())
        self.assertEqual(manifest['phase'], 'finished')
        self.assertTrue(manifest['graceful_save_verified'])
        self.assertEqual((session / 'before/SaveGames/world.sav').read_text(), 'before')
        self.assertEqual((session / 'Saved/SaveGames/world.sav').read_text(), 'after')
        self.assertEqual((session / 'server.log').read_text(), 'new log')
        self.assertFalse((session / 'pid').exists())
        self.assertEqual(closed, ['handle'])

    def test_runner_preserves_timed_default_and_rejects_unsafe_combinations(self):
        self.assertEqual(run_server.arguments([]).minutes, 2)
        self.assertFalse(run_server.arguments([]).untimed)
        self.assertTrue(run_server.arguments(['--untimed', '--ue4ss', 'test.dll']).untimed)
        for args in (
            ['--untimed'], ['--untimed', '--ue4ss', 'test.dll', '--minutes', '2'],
            ['--untimed', '--ue4ss', 'test.dll', '--stop', 'kill'], ['--preflight'],
            ['--request-stop', 'one', '--untimed', '--ue4ss', 'test.dll'],
        ):
            with self.subTest(args=args), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                run_server.arguments(args)


if __name__ == '__main__':
    unittest.main()
