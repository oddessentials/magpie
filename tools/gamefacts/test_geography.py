import json
import math
import os
from types import SimpleNamespace
import unittest

from geography import Reader, contains, field, transform
from zen import INDEX_NULL


class GeographyTest(unittest.TestCase):
    def test_region_property_case_is_not_a_new_identity(self):
        self.assertEqual(field({'RegionId': 7}, 'RegionID'), 7)
        self.assertIsNone(field({}, 'RegionID'))

    def test_component_names_are_scoped_to_their_actor(self):
        pkg = SimpleNamespace(exports=[dict(name='Root', outer=4), dict(name='Root', outer=9)])
        reader = Reader(SimpleNamespace(decode=lambda p, i: (None, {'index': i}, None)))
        self.assertEqual(reader.component(pkg, 9, {'export': 'Root'}), {'index': 1})
        with self.assertRaises(ValueError):
            reader.component(pkg, 3, {'export': 'Root'})

    def test_transform_applies_scale_rotation_and_translation(self):
        self.assertEqual(transform([1, 2, 3], {'RelativeScale3D': [2, 3, 4], 'RelativeRotation': [0, 90, 0], 'RelativeLocation': [10, 20, 30]}), [4, 22, 42])
        with self.assertRaises(ValueError):
            transform([1, 2, 3], {'AttachParent': {'export': 'Other'}})
        with self.assertRaises(ValueError):
            transform([1, 2, 3], {'RelativeRotation': [45, 0, 0]})

    def test_region_membership_is_in_the_transformed_polygon(self):
        polygon = [[10, 20], [30, 20], [30, 40], [10, 40]]
        self.assertTrue(contains([15, 25, -100], polygon))
        self.assertFalse(contains([0, 25, 0], polygon))
        self.assertFalse(contains([15, 45, 0], polygon))

    def test_instance_values_override_templates_without_mutating_them(self):
        pkg = SimpleNamespace(name='test', exports=[dict(template=INDEX_NULL << 62), dict(template=0)])
        values = [{'bIsBoss': True, 'InternalName': 'boss'}, {'bIsBoss': False}]
        reader = Reader(SimpleNamespace(decode=lambda p, i: (None, values[i], None)))
        self.assertEqual(reader.inherited(pkg, 1), {'bIsBoss': False, 'InternalName': 'boss'})
        self.assertTrue(reader.inherited(pkg, 0)['bIsBoss'])
        pkg.exports[0]['template'] = 1
        with self.assertRaises(ValueError):
            Reader(reader.game).inherited(pkg, 0)

    def test_blueprint_ancestry_does_not_require_a_loaded_usmap_class(self):
        pkg = SimpleNamespace(name='map', exports=[dict(name='UnloadedLodestone_C', super=1 << 62)], describe=lambda value: '/Script/Dominion.WorldLodestone')
        reader = Reader(SimpleNamespace(chain=lambda name: [name, 'WorldActor', 'Actor']))
        self.assertEqual(reader.lineage(pkg, 0), ['UnloadedLodestone_C', 'WorldLodestone', 'WorldActor', 'Actor'])

    def test_extracted_geography_has_provenance_and_valid_geometry(self):
        path = os.path.join(os.path.dirname(__file__), '..', '..', 'web', 'src', 'lib', 'world', 'geography.json')
        with open(path, encoding='utf-8') as file:
            facts = json.load(file)
        self.assertGreater(facts['scannedPackages'], 1)
        for kind in ('regions', 'lodestones', 'bosses', 'mapBounds'):
            self.assertTrue(facts[kind])
            self.assertTrue(all(item['package'] for item in facts[kind]))
        ids = [region['id'] for region in facts['regions']]
        self.assertEqual(len(ids), len(set(ids)))
        for region in facts['regions']:
            self.assertTrue(region['name'])
            self.assertGreaterEqual(len(region['boundary']), 3)
            self.assertTrue(all(math.isfinite(n) for p in region['boundary'] for n in p))
        for bounds in facts['mapBounds']:
            self.assertTrue(all(a < b for a, b in zip(bounds['min'], bounds['max'])))
        for stone in facts['lodestones']:
            self.assertRegex(stone['id'], r'^[0-9a-f]{32}$')
            self.assertTrue(all(region in ids for region in stone['regions']))


if __name__ == '__main__':
    unittest.main()
