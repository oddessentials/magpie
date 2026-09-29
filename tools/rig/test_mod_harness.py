import json
import hashlib
import math
from pathlib import Path
import tempfile
import unittest

from mod_harness import Harness, Name, Object, ROOT, Subsystem
from mod_fixture import generate, TARGET
from hook_probe import sanitize


class ModHarnessTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.harness = Harness(self.folder.name)

    def test_every_registered_callback_uses_verified_parameter_names(self):
        harness = self.harness
        build = json.loads((ROOT / 'web/src/lib/world/build.json').read_text())
        self.assertEqual(harness.schema['source']['server_build'], build['server_build'])
        self.assertEqual(harness.schema['source']['version'], build['version'])
        mappings = ROOT / 'tools/rig/mappings' / build['mappings']
        self.assertEqual(harness.schema['source']['mappings_sha256'], hashlib.sha256(mappings.read_bytes()).hexdigest())
        self.assertEqual(len(harness.callbacks), 51)
        for hook in harness.schema['hooks'].values():
            with self.subTest(kind=hook['kind']):
                record = harness.call(hook['kind'])
                self.assertEqual(record['type'], hook['kind'])
                self.assertEqual(record.get('player_name', 'Magpie Fixture'), 'Magpie Fixture')
                self.assertFalse(any(key.startswith('p') and key[1:].isdigit() for key in record))
        self.assertFalse(any('handler failed' in log for log in harness.logs))

    def test_nested_enums_false_values_and_inherited_vectors_survive_serialization(self):
        h = self.harness
        quest = h.struct('/Script/Dominion.QuestProgress', dict(State=2, CurrentObjective=Name('FindTheTemple')))
        record = h.call('quest', dict(UpdatedQuest=quest, bNewlyGiven=False))
        self.assertEqual(record['UpdatedQuest']['State'], 2)
        self.assertFalse(record['bNewlyGiven'])
        self.assertEqual(record['UpdatedQuest']['CurrentObjective'], 'FindTheTemple')
        damage = h.struct('/Script/Dominion.DominionDamageEvent', dict(VictimLocation=h.struct('/Script/Engine.Vector_NetQuantize', dict(X=125.5, Y=-300, Z=4))))
        record = h.call('death', dict(DamageEvent=damage))
        self.assertEqual(record['DamageEvent']['VictimLocation'], dict(X=125.5, Y=-300, Z=4))

    def test_invalid_numeric_and_object_values_do_not_corrupt_json(self):
        h = self.harness
        for value in (math.inf, -math.inf, math.nan):
            with self.subTest(value=value):
                record = h.call('xp_changed', dict(CurrentXP=value))
                self.assertIsNone(record['CurrentXP'])
        record = h.call('xp_changed', dict(SkillData=Object(valid=False)))
        self.assertNotIn('SkillData', record)

    def test_incomplete_context_and_serialization_failures_do_not_disable_other_hooks(self):
        h = self.harness
        record = h.call('skill_level', context=Object(valid=False))
        self.assertNotIn('player_name', record)
        self.assertEqual(h.call('craft_result', dict(Result=0, Count=3))['Count'], 3)
        self.assertFalse(any('handler failed' in log for log in h.logs))

    def test_collector_fixture_reproduces_from_production_lua(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(generate(folder), json.loads(TARGET.read_text(encoding='utf-8')))

    def test_userdata_harness_matches_captured_engine_callback_values(self):
        h = self.harness
        fixture = json.loads((ROOT / 'tools/rig/testdata/engine-callbacks-25501739.json').read_text(encoding='utf-8'))
        self.assertEqual(fixture['source']['server_build'], h.schema['source']['server_build'])
        asset = lambda kind: Object('%s /Game/MagpieFixture/%s.%s' % (kind, kind, kind))
        quest = h.struct('/Script/Dominion.QuestProgress', dict(Data=asset('QuestData'), State=2, CurrentObjective=Name('MagpieFixtureStep'), QuestBools=h.lua.table(), QuestInts=h.lua.table()))
        inputs = [
            ('quest', dict(OldQuest=quest, UpdatedQuest=quest, bNewlyGiven=False, bSendNotification=False)),
            ('xp_changed', dict(SkillData=asset('SkillData'), CurrentXP=250, PreviousXP=175)),
            ('build_complete', dict(InBuildingPieceDataIndex=42, bWasPReviouslyGhosted=True)),
            ('craft_result', dict(Recipe=asset('RecipeData'), Result=0, Count=3)),
        ]
        for (kind, values), captured in zip(inputs, fixture['records'], strict=True):
            with self.subTest(kind=kind):
                self.assertEqual(sanitize(h.call(kind, values, context=Object('PersistenceSubsystem /Game/MagpieFixture.Subsystem'))), captured)

    def test_collector_enum_values_match_current_engine_metadata(self):
        enums = self.harness.schema['enums']
        expected = {'EQuestState': {'Ungiven': 0, 'Given': 1, 'Complete': 2}, 'ECraftingResult': {'Success': 0}, 'EDamageClass': {'Melee': 1, 'Magical': 2, 'Ranged': 3}}
        for kind, values in expected.items():
            for name, value in values.items():
                self.assertEqual(enums['/Script/Dominion.' + kind][kind + '::' + name], value)


class ModStopTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)
        self.stop = self.folder / 'magpie-stop.txt'

    def start(self, subsystem=None):
        harness = Harness(self.folder, stop=self.stop, subsystem=subsystem)
        self.stop.write_text('collector\n', encoding='utf-8')
        harness.tick()
        return harness

    def types(self, harness):
        return [record['type'] for record in harness.records()]

    def test_a_confirmed_save_quits_and_the_stop_file_is_removed(self):
        h = self.start()
        self.assertFalse(self.stop.exists())
        requested = h.records()[-2]
        self.assertEqual((requested['type'], requested['by']), ('stop_requested', 'collector'))
        self.assertEqual(h.subsystem.saves, 1)
        h.tick()
        self.assertEqual(h.library.commands, [])
        h.call('save_done', dict(SlotName=Name('magpie-rig'), bSuccess=True))
        h.tick()
        self.assertEqual(h.library.commands, ['quit'])
        self.assertEqual(self.types(h), ['mod_loaded', 'stop_requested', 'save_requested', 'save_done', 'quit'])

    def test_a_failed_save_keeps_the_server_running_and_a_new_request_works(self):
        h = self.start()
        h.call('save_done', dict(SlotName=Name('magpie-rig'), bSuccess=False))
        h.tick()
        self.assertEqual(h.library.commands, [])
        self.stop.write_text('admin\n', encoding='utf-8')
        h.tick()
        self.assertFalse(self.stop.exists())
        self.assertEqual(h.subsystem.saves, 2)
        self.assertEqual(h.records()[-2]['by'], 'admin')
        h.call('save_done', dict(SlotName=Name('magpie-rig'), bSuccess=True))
        h.tick()
        self.assertEqual(h.library.commands, ['quit'])

    def test_no_save_result_within_30_seconds_keeps_the_server_running(self):
        h = self.start()
        for _ in range(30):
            h.tick()
        failed = h.records()[-1]
        self.assertEqual((failed['type'], failed['reason']), ('save_failed', 'no save result within 30 seconds'))
        self.assertEqual(h.library.commands, [])
        self.assertNotIn('quit', self.types(h))

    def test_a_save_that_cannot_start_keeps_the_server_running(self):
        h = self.start(Subsystem(fail=True))
        failed = h.records()[-1]
        self.assertEqual(failed['type'], 'save_failed')
        self.assertIn('save refused', failed['reason'])
        h.tick()
        self.assertEqual(h.library.commands, [])
        self.assertEqual(self.types(h), ['mod_loaded', 'stop_requested', 'save_requested', 'save_failed'])

    def test_events_are_not_printed_to_the_log(self):
        h = self.start()
        self.assertFalse(any('stop_requested' in str(line) for line in h.logs))


if __name__ == '__main__':
    unittest.main()
