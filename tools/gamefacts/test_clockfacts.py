import json
from types import SimpleNamespace
import unittest

from clockfacts import EVIDENCE, build_clock
from zen import INDEX_NULL


class ClockFactsTest(unittest.TestCase):
    def game(self, props=None):
        source = json.loads(EVIDENCE.read_text(encoding='utf-8'))['source']
        values = props if props is not None else {'RealTimeMinutesPerInGameDay': 24, 'TimeOfDawn': 4.5, 'TimeOfDusk': 22, 'InitialTime': 396000000000}
        pkg = SimpleNamespace(name='clock', exports=[dict(name='Default__BP_InGameTimeActor_C', template=INDEX_NULL << 62)])
        return SimpleNamespace(build=source['server_build'], version=source['version'], package=lambda _: pkg, decode=lambda *args: (None, values, None), source=lambda: dict(build=source['server_build'], version=source['version']))

    def test_clock_requires_verified_build_and_extracted_day_length(self):
        facts = build_clock(self.game())
        self.assertEqual((facts['realMinutesPerGameDay'], facts['storedTimeUnit'], facts['dawnHour']), (24, 'real_seconds', 4.5))
        game = self.game()
        game.build += 1
        with self.assertRaisesRegex(ValueError, 'engine verification'):
            build_clock(game)
        for minutes in (None, 0, 48):
            with self.subTest(minutes=minutes), self.assertRaisesRegex(ValueError, 'day length'):
                build_clock(self.game({'RealTimeMinutesPerInGameDay': minutes}))
        with self.assertRaisesRegex(ValueError, 'dawn or dusk'):
            build_clock(self.game({'RealTimeMinutesPerInGameDay': 24, 'TimeOfDawn': float('nan'), 'TimeOfDusk': 22}))


if __name__ == '__main__':
    unittest.main()
