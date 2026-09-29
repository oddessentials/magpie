import copy
import json
from pathlib import Path
import tempfile
import unittest

from save_probe import check, EXPECTED_POIS, EXPECTED_VALUES


class SaveProbeTests(unittest.TestCase):
    def test_engine_and_decoder_must_agree_after_verified_shutdown(self):
        with tempfile.TemporaryDirectory() as folder:
            session = Path(folder)
            manifest = dict(phase='finished', graceful_save_verified=True, capture_verified=True, server_build=25501739, game_version='1.0.0.6')
            (session / 'recording.json').write_text(json.dumps(manifest))
            (session / 'magpie-probe.txt').write_text('clock PASS\nprogress PASS\npoi PASS\nSAVE_FIELDS_DONE\n')
            decoded = dict(clock_seconds=1800, discoveries=[dict(character_guid=guid, pois=pois) for guid, pois in EXPECTED_POIS.items()], progress=dict(defeated_bosses=['MagpieFixtureBoss', 'GeneralVelgar'], values=[dict(tag=tag, value=value) for tag, value in EXPECTED_VALUES.items()]))
            report = check(session, decoded)
            self.assertEqual((report['characters'], report['pois'], report['bosses'], report['tagged_values']), (2, 3, 2, 2))
            self.assertNotIn('11111111', json.dumps(report))
            for replacement in (dict(clock_seconds=720), dict(discoveries=[]), dict(progress={})):
                with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                    check(session, {**decoded, **replacement})
            duplicate = copy.deepcopy(decoded)
            duplicate['discoveries'].append(duplicate['discoveries'][0])
            with self.assertRaises(ValueError):
                check(session, duplicate)
            (session / 'magpie-probe.txt').write_text('clock ERROR failure\nprogress PASS\npoi PASS\nSAVE_FIELDS_DONE\n')
            with self.assertRaisesRegex(ValueError, 'probe'):
                check(session, decoded)
            (session / 'recording.json').write_text(json.dumps({**manifest, 'capture_verified': False}))
            with self.assertRaisesRegex(ValueError, 'capture'):
                check(session, decoded)


if __name__ == '__main__':
    unittest.main()
