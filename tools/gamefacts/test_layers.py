import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import layers

WORLD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'web', 'src', 'lib', 'world'))


class ClassifyTest(unittest.TestCase):
    def test_native_ancestry_decides_the_layer(self):
        cases = [
            (['BP_OreNode_Iron_Medium_C1_C', 'BP_OreNode_Medium_PARENT_C', 'BP_OreNode_C', 'OreNode', 'WorldActor'], ('resource', 'ore')),
            (['BP_OreNode_Stone_C', 'BP_MiningRock_Base_C', 'DestructibleMiningRock', 'DestructibleWorldActor'], ('resource', 'rock')),
            (['BP_Spawner_Flax_C', 'BP_BaseGatherableResource_C', 'GatherableResource', 'BaseInteractableResource'], ('resource', 'gatherable')),
            (['BP_DwellberryBush_C', 'HarvestableResource', 'BaseInteractableResource'], ('resource', 'harvestable')),
            (['BP_Spawner_Salvage_Metal_C', 'BP_BaseSalvageableResource_C', 'SalvageableResource'], ('resource', 'salvage')),
            (['BP_FishingNodeV2_Net_Fellhollow_C', 'BP_FishingNodeV2_C', 'FishingNodeV2'], ('fishing', None)),
            (['BP_BuriedChest_Tier5_World_Fellhollow_C', 'BP_BuriedChest_Base_C', 'DiggableChest', 'WorldChest'], ('chest', True)),
            (['BP_LootChest_Prefab_Tier5_World_C', 'BP_LootChest_Base_C', 'WorldChest'], ('chest', False)),
            (['BP_QuestLocation_C', 'QuestLocation'], ('quest', None)),
            (['BP_HealthShrine_C', 'HealthShrine'], ('shrine', None)),
            (['BP_SpawnPoint_Wolf_C', 'AISpawnPoint'], ('spawn', None)),
            (['BP_Tree_Ash_03_C', 'BP_FellableTree_Base_C', 'FellableTree', 'DestructibleWorldActor'], (None, None)),
        ]
        for chain, expected in cases:
            with self.subTest(cls=chain[0]):
                self.assertEqual(layers.classify(chain[0], chain), expected)
        self.assertEqual(layers.classify('BP_LoreItem_C', ['WorldActor']), ('lore', None))
        self.assertEqual(layers.classify('Dungeon', []), ('dungeon', None))
        self.assertEqual(layers.classify('BP_AnimaVent_C', []), ('vent', None))
        self.assertEqual(layers.classify('BP_InteractablePlayerTeleporter_RequiresQuestStep_C', ['WorldActor']), ('teleporter', None))

    def test_references_become_asset_names(self):
        self.assertEqual(layers.asset_name({'package': '/Game/Gameplay/Items/ITEM_Resources_IronOre', 'hash': 1}), 'ITEM_Resources_IronOre')
        self.assertEqual(layers.asset_name({'asset': 'BP_AI_Wolf_Data_C'}), 'BP_AI_Wolf_Data')
        self.assertIsNone(layers.asset_name(None))

    def test_drop_entries_keep_counts_chance_and_perk_tags(self):
        entry = {'ItemDataClass': {'package': '/Game/ITEM_Resources_Jade', 'asset': 'ITEM_Resources_Jade'}, 'MinToDrop': 1, 'MaxToDrop': 1, 'ProbabilityOfDrop': 0.05000000074505806, 'RequiredTagQuery': {'TagDictionary': [{'TagName': 'Perk.Mining.FindGems'}]}}
        self.assertEqual(layers.drop_entry(entry), dict(item='ITEM_Resources_Jade', min=1, max=1, chance=0.05, tags=['Perk.Mining.FindGems']))

    def test_catches_are_found_inside_species_data(self):
        info = {'PristineDrop': {'ItemDropData': {'ItemDataClass': {'package': '/Fishing/ITEM_Fish_Pristine_Lobster'}}}, 'NormalDrop': {'ItemDropData': {'ItemDataClass': {'package': '/Fishing/ITEM_Fish_Lobster'}}}}
        self.assertEqual(sorted(layers.items_within(info)), ['ITEM_Fish_Lobster', 'ITEM_Fish_Pristine_Lobster'])

    def test_points_are_whole_units_with_their_cell(self):
        self.assertEqual(layers.point([210424.621, -62003.038, -7396.396], 4), [210425, -62003, -7396, 4])


@unittest.skipUnless(os.path.exists(os.path.join(WORLD, 'layers.json')), 'no extracted facts')
class LayersFileTest(unittest.TestCase):
    def load(self, name):
        with open(os.path.join(WORLD, name), encoding='utf-8') as f:
            return json.load(f)

    def test_every_point_names_a_scanned_cell(self):
        data = self.load('layers.json')
        cells = len(data['cells'])
        self.assertTrue(all(cell.startswith('RSDragonwilds/Content/Maps/World/L_World') for cell in data['cells']))
        points = [p for group in data['resources'] + data['fishing'] + data['chests'] + data['spawns'] for p in group['points']]
        points += [record['point'] for key in ('lore', 'quests', 'shrines', 'teleporters', 'dungeons') for record in data[key]] + data['vents']
        self.assertTrue(len(points) > 10000)
        for p in points:
            self.assertTrue(all(isinstance(value, int) for value in p[:4]))
            self.assertTrue(0 <= p[3] < cells)

    def test_layer_links_resolve_to_other_facts(self):
        data = self.load('layers.json')
        items = {item['asset'] for item in self.load('items.json')['items']}
        journal = {entry['asset'] for entry in self.load('journal.json')['entries']}
        quests = {quest['asset'] for quest in self.load('quests.json')['quests']}
        creatures = {creature['asset'] for creature in self.load('creatures.json')['creatures']}
        for group in data['resources']:
            self.assertTrue(all(entry['item'] in items for entry in group['items']), group['class'])
        for group in data['fishing']:
            self.assertTrue(group['catches'] and all(item in items for item in group['catches']), group['class'])
        self.assertTrue(all(record['journal'] in journal for record in data['lore']))
        self.assertTrue(all(record['quest'] is None or record['quest'] in quests for record in data['quests']))
        self.assertTrue(all(group['creature'] in creatures for group in data['spawns']))
        profiles = data['chestProfiles']
        for group in data['chests']:
            self.assertEqual(group['profileFound'], group['profile'] in profiles.get(group['profileTable'], {}), group['class'])
        self.assertTrue(sum(len(group['points']) for group in data['chests'] if group['profileFound']) > 400)


if __name__ == '__main__':
    unittest.main()
