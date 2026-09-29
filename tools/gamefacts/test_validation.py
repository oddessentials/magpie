import contextlib
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import extract


def game(build=123, version='1.0', value=42, present=True, unreadable=0):
    return SimpleNamespace(app=extract.SERVER_APP, build=build, version=version, container='test', unreadable=unreadable, store=SimpleNamespace(has=lambda _: present), package=lambda path: path, decode=lambda *args: (None, {'Count': value}, None), scan=lambda: {'ItemData': [('test.uasset', 0, 'ItemData')]}, close=lambda: None)


class ValidationTests(unittest.TestCase):
    def test_missing_provenance_cannot_inherit_a_previous_build(self):
        for build, version in ((None, '1.0'), (0, '1.0'), (123, None), (123, 'unknown')):
            with self.subTest(build=build, version=version), self.assertRaises(ValueError):
                extract.build_info(game(build, version), 456, 'test.usmap')
        result = extract.build_info(game(), None, 'test.usmap')
        self.assertEqual(result['server_build'], 123)
        self.assertIsNone(result['client_build'])

    def test_comparison_requires_matching_readable_assets(self):
        found = {'ItemData': [('test.uasset', 0, 'ItemData')]}
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(extract.compare(game(), game(), found), 1)
            for client, entries in ((game(value=43), found), (game(present=False), found), (game(), {})):
                with self.subTest(client=client, entries=entries), self.assertRaisesRegex(ValueError, 'comparison failed'):
                    extract.compare(game(), client, entries)
            client = game()
            client.decode = lambda *args: (_ for _ in ()).throw(ValueError('bad mappings'))
            with self.assertRaisesRegex(ValueError, 'comparison failed'):
                extract.compare(game(), client, found)

    def test_server_test_assets_are_reported_separately_from_production_assets(self):
        client = game()
        client.store.has = lambda path: '/Gameplay/test/' not in path
        found = {'ItemData': [('test.uasset', 0, 'ItemData'), ('RSDragonwilds/Content/Gameplay/test/OnlyServer.uasset', 0, 'ItemData')]}
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(extract.compare(game(), client, found), 1)
        self.assertIn('server-only test assets excluded from client comparison: 1', output.getvalue())

    def test_failed_extraction_preserves_every_existing_output(self):
        for server, client in ((game(), game(value=43)), (game(), game(build=None)), (game(unreadable=1), game()), (game(), game(unreadable=1))):
            with self.subTest(server=server, client=client), tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as patches:
                output = Path(folder)
                for name in extract.FILES:
                    (output / name).write_text('previous ' + name)
                before = {path.name: path.read_bytes() for path in output.iterdir()}
                patches.enter_context(patch.object(extract.usmap, 'load', return_value=None))
                patches.enter_context(patch.object(extract, 'Game', side_effect=[server, client]))
                for name in ('skills', 'xp', 'quests', 'journal', 'items', 'recipes', 'progression', 'geography', 'clock', 'buildings', 'stations', 'creatures', 'layers'):
                    patches.enter_context(patch.object(extract, 'build_' + name, return_value={'source': {}}))
                patches.enter_context(patch.object(extract, 'link_journal'))
                patches.enter_context(contextlib.redirect_stdout(io.StringIO()))
                with self.assertRaises(ValueError):
                    extract.main(['--paks', 'server', '--client-paks', 'client', '--usmap', 'test.usmap', '--out', folder])
                self.assertEqual({path.name: path.read_bytes() for path in output.iterdir()}, before)

    def test_server_only_extraction_does_not_claim_previous_client_was_checked(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as patches:
            output = Path(folder)
            (output / 'build.json').write_text('{"client_build":999}')
            patches.enter_context(patch.object(extract.usmap, 'load', return_value=None))
            patches.enter_context(patch.object(extract, 'Game', return_value=game()))
            patches.enter_context(patch.object(extract.subprocess, 'run'))
            for name in ('skills', 'xp', 'quests', 'journal', 'items', 'recipes', 'progression', 'geography', 'clock', 'buildings', 'stations', 'creatures', 'layers'):
                patches.enter_context(patch.object(extract, 'build_' + name, return_value={'source': {}}))
            patches.enter_context(patch.object(extract, 'link_journal'))
            patches.enter_context(contextlib.redirect_stdout(io.StringIO()))
            extract.main(['--paks', 'server', '--no-client', '--usmap', 'test.usmap', '--out', folder])
            self.assertIsNone(json.loads((output / 'build.json').read_text())['client_build'])


if __name__ == '__main__':
    unittest.main()
