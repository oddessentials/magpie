import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from hook_probe import ROOT, check, sanitize


class HookProbeTests(unittest.TestCase):
    def test_capture_checks_reject_stale_failed_and_corrupted_evidence(self):
        fixture = json.loads((ROOT / 'tools/rig/testdata/engine-callbacks-25501739.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as folder:
            session = Path(folder)
            manifest = dict(phase='finished', capture_verified=True, graceful_save_verified=True, exit_code=0, server_build=fixture['source']['server_build'], game_version=fixture['source']['version'], mod_sha256=hashlib.sha256((ROOT / 'mod/MagpieEvents/Scripts/main.lua').read_bytes()).hexdigest())
            markers = 'CALLBACKS_PASS\nSCHEMA_PASS\nQUEST_USERDATA userdata ScriptStruct /Script/Dominion.QuestProgress\n'
            (session / 'recording.json').write_text(json.dumps(manifest))
            (session / 'magpie-probe.txt').write_text(markers)
            events = session / 'magpie-probe.txt.callbacks.jsonl'
            events.write_text('\n'.join(json.dumps(record) for record in fixture['records']))
            self.assertEqual(check(session)['records'], fixture['records'])
            for patch in (dict(capture_verified=False), dict(graceful_save_verified=False), dict(exit_code=3), dict(mod_sha256='stale'), dict(server_build=1)):
                (session / 'recording.json').write_text(json.dumps({**manifest, **patch}))
                with self.subTest(patch=patch), self.assertRaises(ValueError):
                    check(session)
            (session / 'recording.json').write_text(json.dumps(manifest))
            (session / 'magpie-probe.txt').write_text(markers + 'CALLBACKS_ERROR failed\n')
            with self.assertRaisesRegex(ValueError, 'probe'):
                check(session)
            (session / 'magpie-probe.txt').write_text(markers)
            corrupted = copy.deepcopy(fixture['records'])
            corrupted[0]['UpdatedQuest']['State'] = 'EnumProperty'
            events.write_text('\n'.join(json.dumps(record) for record in corrupted))
            with self.assertRaisesRegex(ValueError, 'quest'):
                check(session)
            events.write_text('\n'.join(json.dumps(record) for record in fixture['records'][:-1]))
            with self.assertRaisesRegex(ValueError, 'sequence'):
                check(session)

    def test_sanitizer_only_accepts_expected_transient_types(self):
        self.assertEqual(sanitize('SkillData /Engine/Transient.PrivatePath'), 'SkillData /Game/MagpieFixture/SkillData.SkillData')
        self.assertEqual(sanitize(dict(self='private', ts='private', State=2)), dict(State=2))
        with self.assertRaises(ValueError):
            sanitize('UnknownObject /Engine/Transient.PrivatePath')


if __name__ == '__main__':
    unittest.main()
