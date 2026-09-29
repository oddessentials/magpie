import json
import os
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import extract
import locres
import usmap
from iostore import Container, Store
from pak import Pak
from properties import Decoder, Reader, Text
from zen import Package, ScriptObjects

WORLD = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'web', 'src', 'lib', 'world')


def fstring(text):
    if text == '':
        return struct.pack('<i', 0)
    raw = text.encode('utf-8') + b'\0'
    return struct.pack('<i', len(raw)) + raw


def name_batch(names):
    if not names:
        return struct.pack('<i', 0)
    strings = b''.join(name.encode('utf-8') for name in names)
    out = struct.pack('<iIQ', len(names), len(strings), 0) + b'\0' * (8 * len(names))
    for name in names:
        length = len(name.encode('utf-8'))
        out += bytes([(length >> 8) & 0x7F, length & 0xFF])
    return out + strings


class UsmapBuilder:
    def __init__(self):
        self.names = []
        self.enums = []
        self.structs = []

    def name(self, text):
        if text not in self.names:
            self.names.append(text)
        return self.names.index(text)

    def kind(self, spec):
        head = spec[0]
        out = bytes([usmap.TYPES.index(head)])
        if head == 'Enum':
            return out + self.kind(spec[1]) + struct.pack('<I', self.name(spec[2]))
        if head == 'Struct':
            return out + struct.pack('<I', self.name(spec[1]))
        if head in ('Array', 'Set', 'Optional'):
            return out + self.kind(spec[1])
        if head == 'Map':
            return out + self.kind(spec[1]) + self.kind(spec[2])
        return out

    def enum(self, name, entries):
        self.enums.append((name, entries))

    def struct(self, name, parent, fields):
        self.structs.append((name, parent, fields))

    def build(self):
        enums = b''
        for name, entries in self.enums:
            enums += struct.pack('<IH', self.name(name), len(entries))
            for entry, value in entries:
                enums += struct.pack('<q', value) + struct.pack('<I', self.name(entry))
        structs = b''
        for name, parent, fields in self.structs:
            body = b''
            slot = 0
            for field, spec, dim in fields:
                body += struct.pack('<HB', slot, dim) + struct.pack('<I', self.name(field)) + self.kind(spec)
                slot += dim
            structs += struct.pack('<II', self.name(name), self.name(parent) if parent else 0xFFFFFFFF) + struct.pack('<HH', slot, len(fields)) + body
        names = struct.pack('<I', len(self.names))
        for name in self.names:
            raw = name.encode('utf-8')
            names += struct.pack('<H', len(raw)) + raw
        payload = names + struct.pack('<I', len(self.enums)) + enums + struct.pack('<I', len(self.structs)) + structs
        return struct.pack('<HBBII', usmap.MAGIC, 4, 0, len(payload), len(payload)) + payload


def sample_mappings():
    builder = UsmapBuilder()
    builder.enum('EKind', [('Zero', 0), ('One', 1), ('Two', 2)])
    builder.struct('Object', None, [])
    builder.struct('Inner', None, [('X', ('Float',), 1), ('Tag', ('Name',), 1)])
    builder.struct('Base', 'Object', [('Id', ('Str',), 1), ('Flag', ('Bool',), 1)])
    builder.struct('Thing', 'Base', [('Label', ('Text',), 1), ('Count', ('Int',), 1), ('Kind', ('Enum', ('Byte', None), 'EKind'), 1), ('Parts', ('Array', ('Struct', 'Inner')), 1), ('Ref', ('Object',), 1), ('Icon', ('SoftObject',), 1), ('Pair', ('Int',), 2), ('Notes', ('Map', ('Name',), ('Str',)), 1)])
    return usmap.Mappings(builder.build())


class PackageBuilder:
    def __init__(self, package_name, unversioned):
        self.names = []
        self.package_name = package_name
        self.unversioned = unversioned
        self.imports = []
        self.imported_packages = []
        self.exports = []

    def name(self, text):
        if text not in self.names:
            self.names.append(text)
        return self.names.index(text)

    def fname(self, text, number=0):
        return struct.pack('<II', self.name(text), number)

    def script_import(self, path):
        index = (1 << 62) | (hash(path) & 0xFFFFFFFF)
        self.imports.append(index)
        return -len(self.imports)

    def package_import(self, package, export_hash):
        if package not in self.imported_packages:
            self.imported_packages.append(package)
        self.hashes = getattr(self, 'hashes', [])
        index = (2 << 62) | (self.imported_packages.index(package) << 32) | len(self.hashes)
        self.hashes.append(export_hash)
        self.imports.append(index)
        return -len(self.imports)

    def export(self, name, class_index, data):
        self.exports.append((name, class_index, data))
        return len(self.exports)

    def build(self):
        hashes = getattr(self, 'hashes', [])
        for export_name, _, _ in self.exports:
            self.name(export_name)
        self.name(self.package_name)
        names = name_batch(self.names)
        p = 60 + len(names)
        pad = (-(p + 8)) % 8
        header = names + struct.pack('<q', pad) + b'\0' * pad
        p += 8 + pad
        hashes_offset = p
        header += b''.join(struct.pack('<Q', value) for value in hashes)
        p += 8 * len(hashes)
        import_map_offset = p
        header += b''.join(struct.pack('<Q', value) for value in self.imports)
        p += 8 * len(self.imports)
        export_map_offset = p
        offset = 0
        for export_name, class_index, data in self.exports:
            cls = (3 << 62) if class_index == 0 else self.imports[-class_index - 1]
            header += struct.pack('<QQIIQQQQQIB3x', offset, len(data), self.name(export_name), 0, 3 << 62, cls, 3 << 62, 3 << 62, 0, 0, 0)
            offset += len(data)
        p += 72 * len(self.exports)
        bundle_offset = p
        for index in range(len(self.exports)):
            header += struct.pack('<II', index, 0) + struct.pack('<II', index, 1)
        p += 16 * len(self.exports)
        dependency_offset = p
        imported_names_offset = p
        imported = name_batch(self.imported_packages) + b'\0' * (4 * len(self.imported_packages))
        header += imported
        p += len(imported)
        header_size = p
        flags = 0x80000200 | (0x2000 if self.unversioned else 0)
        summary = struct.pack('<IIIIIIiiiiiiiii', 0, header_size, self.name(self.package_name), 0, flags, header_size, hashes_offset, import_map_offset, export_map_offset, bundle_offset, dependency_offset, dependency_offset, imported_names_offset, bundle_offset, bundle_offset)
        return summary + header + b''.join(data for _, _, data in self.exports) + b'\0' * 4


def tag(builder, name, type_tree, value, flags=0, array_index=None):
    def tree(node):
        node_name, children = node
        return builder.fname(node_name) + struct.pack('<i', len(children)) + b''.join(tree(child) for child in children)
    if array_index is not None:
        flags |= 1
    return builder.fname(name) + tree(type_tree) + struct.pack('<i', len(value)) + bytes([flags]) + (struct.pack('<i', array_index) if array_index is not None else b'') + value


def text_bytes(namespace, key, source):
    return struct.pack('<Ib', 0, 0) + fstring(namespace) + fstring(key) + fstring(source)


def tagged_thing(builder, ref_index):
    inner = tag(builder, 'X', ('FloatProperty', []), struct.pack('<f', 1.5)) + tag(builder, 'Tag', ('NameProperty', []), builder.fname('Wood')) + builder.fname('None')
    body = b'\0'
    body += tag(builder, 'Id', ('StrProperty', []), fstring('abc'))
    body += tag(builder, 'Flag', ('BoolProperty', []), b'', flags=16)
    body += tag(builder, 'Label', ('TextProperty', []), text_bytes('', 'KEY1', 'Hello'))
    body += tag(builder, 'Count', ('IntProperty', []), struct.pack('<i', 42))
    body += tag(builder, 'Kind', ('EnumProperty', [('EKind', [('/Script/Test', [])]), ('ByteProperty', [])]), builder.fname('EKind::Two'))
    body += tag(builder, 'Parts', ('ArrayProperty', [('StructProperty', [('Inner', [('/Script/Test', [])])])]), struct.pack('<i', 1) + inner)
    body += tag(builder, 'Ref', ('ObjectProperty', []), struct.pack('<i', ref_index))
    body += tag(builder, 'Icon', ('SoftObjectProperty', []), builder.fname('/Game/Art/Icon') + builder.fname('Icon') + fstring(''))
    body += tag(builder, 'Pair', ('IntProperty', []), struct.pack('<i', 7), array_index=1)
    body += tag(builder, 'Notes', ('MapProperty', [('NameProperty', []), ('StrProperty', [])]), struct.pack('<ii', 0, 1) + builder.fname('Wood') + fstring('note'))
    body += builder.fname('None') + struct.pack('<I', 0)
    return body


def unversioned_thing(builder, ref_index):
    fragments = struct.pack('<H', 6 << 9) + struct.pack('<H', 0x80 | (3 << 9)) + struct.pack('<H', 0x100 | (2 << 9))
    zero_mask = bytes([0b001])
    inner = struct.pack('<H', 0 | (2 << 9) | 0x100) + struct.pack('<f', 1.5) + builder.fname('Wood')
    body = fragments + zero_mask
    body += text_bytes('', 'KEY1', 'Hello')
    body += struct.pack('<i', 42)
    body += bytes([2])
    body += struct.pack('<i', 1) + inner
    body += struct.pack('<i', ref_index)
    body += builder.fname('/Game/Art/Icon') + builder.fname('Icon') + fstring('')
    body += struct.pack('<i', 7)
    body += struct.pack('<ii', 0, 1) + builder.fname('Wood') + fstring('note')
    body += fstring('abc')
    body += bytes([1])
    body += struct.pack('<I', 0)
    return body


def sample_package(unversioned):
    builder = PackageBuilder('/Game/Things/Thing', unversioned)
    thing_class = builder.script_import('/Script/Test.Thing')
    other = builder.package_import('/Game/Things/Other', 12345)
    data = unversioned_thing(builder, other) if unversioned else tagged_thing(builder, other)
    builder.export('Thing', thing_class, data)
    return Package(builder.build(), None), builder


def iostore_files(files):
    block_size = 65536
    ucas = b''
    chunk_ids = b''
    offlens = b''
    blocks = b''
    for index, (path, data) in enumerate(files):
        chunk_ids += struct.pack('<Q', index + 1) + b'\0\0\0' + bytes([1])
        offlens += (index * block_size).to_bytes(5, 'big') + len(data).to_bytes(5, 'big')
        padded = data + b'\0' * (block_size - len(data))
        blocks += (len(ucas)).to_bytes(5, 'little') + len(data).to_bytes(3, 'little') + len(data).to_bytes(3, 'little') + b'\0'
        ucas += padded
    strings = ['Root'] + [os.path.basename(path) for path, _ in files]
    dirs = struct.pack('<i', 1) + struct.pack('<4I', 0, 0xFFFFFFFF, 0xFFFFFFFF, 0)
    entries = struct.pack('<i', len(files))
    for index, (path, _) in enumerate(files):
        entries += struct.pack('<3I', index + 1, index + 1 if index + 1 < len(files) else 0xFFFFFFFF, index)
    directory = fstring('../../../') + dirs + entries + struct.pack('<i', len(strings)) + b''.join(fstring(s) for s in strings)
    header = bytearray(144)
    header[:16] = b'-==--==--==--==-'
    header[16] = 8
    struct.pack_into('<9I', header, 20, 144, len(files), len(files), 10, 0, 32, block_size, len(directory), 1)
    struct.pack_into('<Q', header, 56, 1)
    header[80] = 8
    struct.pack_into('<Q', header, 88, 0)
    utoc = bytes(header) + chunk_ids + offlens + blocks + directory
    return utoc, ucas


def pak_bytes(files):
    body = b''
    entries = []
    for path, data in files:
        entry = struct.pack('<QQQI', len(body), len(data), len(data), 0) + b'\0' * 20 + b'\0' + struct.pack('<I', 0)
        entries.append((path, len(body)))
        body += entry + data
    encoded = b''
    directory_files = b''
    for (path, data), (_, offset) in zip(files, entries):
        directory_files += fstring(path) + struct.pack('<i', len(encoded))
        encoded += struct.pack('<I', (1 << 31) | (1 << 30)) + struct.pack('<II', offset, len(data))
    directory = struct.pack('<i', 1) + fstring('Root/') + struct.pack('<i', len(files)) + directory_files
    directory_offset = len(body)
    index = fstring('../../../') + struct.pack('<i', len(files)) + struct.pack('<Q', 0) + struct.pack('<i', 0) + struct.pack('<i', 1) + struct.pack('<qq', directory_offset, len(directory)) + b'\0' * 20 + struct.pack('<i', len(encoded)) + encoded + struct.pack('<i', 0)
    index_offset = directory_offset + len(directory)
    footer = b'\0' * 16 + b'\0' + struct.pack('<II', 0x5A6F12E1, 11) + struct.pack('<QQ', index_offset, len(index)) + b'\0' * 20 + b'\0' * 160
    return body + directory + index + footer


def locres_bytes(table):
    strings = []
    body = b''
    for namespace, entries in table.items():
        body += struct.pack('<I', 0) + fstring(namespace) + struct.pack('<I', len(entries))
        for key, value in entries.items():
            strings.append(value)
            body += struct.pack('<I', 0) + fstring(key) + struct.pack('<I', 0) + struct.pack('<i', len(strings) - 1)
    head = locres.MAGIC + bytes([3])
    strings_offset = len(head) + 8 + 4 + 4 + len(body)
    out = head + struct.pack('<q', strings_offset) + struct.pack('<I', len(strings)) + struct.pack('<I', len(table)) + body
    out += struct.pack('<i', len(strings)) + b''.join(fstring(s) + struct.pack('<i', 1) for s in strings)
    return out


class MappingsTest(unittest.TestCase):
    def test_schema_is_derived_first_and_expands_static_arrays(self):
        maps = sample_mappings()
        schema = maps.schema('Thing')
        self.assertEqual([slot[0] for slot in schema], ['Label', 'Count', 'Kind', 'Parts', 'Ref', 'Icon', 'Pair[0]', 'Pair[1]', 'Notes', 'Id', 'Flag'])
        self.assertEqual(schema[2][1], ('Enum', ('Byte', None), 'EKind'))
        self.assertEqual(maps.enum_value('EKind', 2), 'EKind::Two')
        self.assertEqual(maps.enum_value('EKind', 9), 'EKind::9')


class PropertiesTest(unittest.TestCase):
    def test_guid_uses_unreal_words_matching_saved_discoveries(self):
        decoder = Decoder(None, None)
        raw = bytes.fromhex('78563412f0debc9adf9b5713e0ac6824')
        self.assertEqual(decoder.struct(Reader(raw), 'Guid', None), '123456789ABCDEF013579BDF2468ACE0')

    def check(self, props):
        self.assertEqual(props['Id'], 'abc')
        self.assertIs(props['Flag'], True)
        self.assertIsInstance(props['Label'], Text)
        self.assertEqual((props['Label'].key, props['Label'].source), ('KEY1', 'Hello'))
        self.assertEqual(props['Count'], 42)
        self.assertEqual(props['Kind'], 'EKind::Two')
        self.assertEqual(props['Parts'], [{'X': 1.5, 'Tag': 'Wood'}])
        self.assertEqual(props['Ref'], {'package': '/Game/Things/Other', 'hash': 12345})
        self.assertEqual(props['Icon'], {'package': '/Game/Art/Icon', 'asset': 'Icon'})
        self.assertEqual(props['Notes'], [('Wood', 'note')])

    def test_tagged_properties(self):
        pkg, _ = sample_package(False)
        self.assertFalse(pkg.unversioned)
        self.assertEqual(pkg.name, '/Game/Things/Thing')
        self.assertEqual(pkg.imported_packages, ['/Game/Things/Other'])
        props, reader = Decoder(pkg, None).read_object(pkg.export_data(0), None)
        self.check(props)
        self.assertEqual(props['Pair[1]'], 7)
        self.assertEqual(reader.u32(), 0)

    def test_unversioned_properties(self):
        pkg, _ = sample_package(True)
        self.assertTrue(pkg.unversioned)
        props, reader = Decoder(pkg, sample_mappings()).read_object(pkg.export_data(0), 'Thing')
        self.check(props)
        self.assertEqual(props['Pair[1]'], 7)
        self.assertEqual(props['Pair[0]'], 0)
        self.assertEqual(reader.u32(), 0)


class ContainerTest(unittest.TestCase):
    def test_reads_files_by_path(self):
        utoc, ucas = iostore_files([('A.uasset', b'alpha'), ('B.uasset', b'bravo' * 3)])
        with tempfile.TemporaryDirectory() as folder:
            with open(os.path.join(folder, 'Test.utoc'), 'wb') as f:
                f.write(utoc)
            with open(os.path.join(folder, 'Test.ucas'), 'wb') as f:
                f.write(ucas)
            container = Container(folder, 'Test')
            self.assertEqual(sorted(container.paths.values()), ['Root/A.uasset', 'Root/B.uasset'])
            self.assertEqual(container.read('Root/B.uasset'), b'bravo' * 3)
            container.close()


class PakTest(unittest.TestCase):
    def test_reads_uncompressed_entries(self):
        data = pak_bytes([('Game.ini', b'[Section]\nKey=Value\n'), ('Other.txt', b'x' * 100)])
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'Test.pak')
            with open(path, 'wb') as f:
                f.write(data)
            pak = Pak(path)
            self.assertEqual(pak.paths(), ['Root/Game.ini', 'Root/Other.txt'])
            self.assertEqual(pak.read('Root/Game.ini'), b'[Section]\nKey=Value\n')
            self.assertEqual(pak.read('root/other.txt'), b'x' * 100)
            pak.close()


class LocresTest(unittest.TestCase):
    def test_reads_namespaces_and_keys(self):
        table = locres.read(locres_bytes({'': {'ABC': 'Hello'}, 'ST_Names': {'Sword': 'Bronze Sword', 'Axe': 'Bronze Axe'}}))
        self.assertEqual(table, {'': {'ABC': 'Hello'}, 'ST_Names': {'Sword': 'Bronze Sword', 'Axe': 'Bronze Axe'}})


class StubGame:
    def __init__(self, objects):
        self.objects_by_path = objects
        self.mappings = sample_mappings()
        self.game_ini = '[/Script/Dominion.SkillSettings]\nXPCurveRowHandle=(CurveTable="/Script/Engine.CurveTable\'/Game/CT_XP.CT_XP\'",RowName="Row_2")\n'
        self.mappings.enums['ESkill'] = [('Invalid', 0), ('Attack', 3), ('Cooking', 5)]
        self.mappings.enums['EQuestState'] = [('Ungiven', 0), ('Given', 1), ('Complete', 2), ('EQuestState_MAX', 3)]
        self.mappings.enums['EQuestRegion'] = [('None', 0), ('Brynmoor', 1), ('MAX', 2)]
        self.mappings.enums['EJournalEntryUnlockType'] = [('PlayerStart', 0), ('RecipeUnlocked', 2)]
        self.store = type('S', (), {'paths': {0: '/Game/CT_XP'}})()

    def source(self):
        return dict(app=1, build=2, version='3', container='test')

    def package(self, path):
        return path

    def decode(self, pkg, index):
        return None, self.objects_by_path[pkg], None

    def text(self, value):
        return value.source if isinstance(value, Text) else None

    def feature_of(self, path):
        return 'Fishing' if '/GameFeatures/Fishing/' in path else None

    def container_path(self, package):
        return package

    def rows(self, path):
        if path == '/Game/CT_XP':
            return 'CT_XP', 'SimpleCurve', [('Row_2', {'InterpMode': 'ERichCurveInterpMode::RCIM_Linear', 'Keys': [{'Time': 0.0, 'Value': 0.0}, {'Time': 1.0, 'Value': 0.0}, {'Time': 2.0, 'Value': 33.0}, {'Time': 3.0, 'Value': 70.0}]})]
        return None, None, []


class BuildersTest(unittest.TestCase):
    def test_skills_are_ordered_by_enum_and_carry_ids(self):
        game = StubGame({'RSDragonwilds/Content/Gameplay/Skills/SKILL_Cooking.uasset': {'PersistenceID': 'cook', 'Name': Text('Cooking', '', 'k'), 'SkillType': 'ESkill::Cooking', 'MaxLevel': 99}, 'RSDragonwilds/Plugins/GameFeatures/Fishing/Content/Gameplay/SKILL_Attack.uasset': {'PersistenceID': 'atk', 'Name': Text('Attack', '', 'k'), 'SkillType': 'ESkill::Attack', 'MaxLevel': 99, 'bSoftDeleted': False}})
        found = {'SkillData': [(path, 0, 'SkillData') for path in game.objects_by_path]}
        result = extract.build_skills(game, found)
        self.assertEqual([s['asset'] for s in result['skills']], ['SKILL_Attack', 'SKILL_Cooking'])
        self.assertEqual(result['skills'][0]['feature'], 'Fishing')
        self.assertEqual(result['skills'][0]['id'], 'atk')
        self.assertEqual(result['skills'][1]['enum'], 5)
        self.assertEqual(result['source']['container'], 'test')

    def test_xp_curve_follows_the_configured_row(self):
        game = StubGame({})
        result = extract.build_xp(game, {})
        self.assertEqual(result['row'], 'Row_2')
        self.assertEqual(result['xpForLevel'], [0, 33, 70])
        self.assertEqual(result['interpolation'], 'RCIM_Linear')

    def test_quests_and_journal_resolve_text_and_enums(self):
        quest = {'PersistenceID': 'q1', 'QuestName': Text('First Steps', '', 'k'), 'QuestDescription': Text('Go', '', 'k'), 'QuestRegion': 'EQuestRegion::Brynmoor', 'bIsMainQuest': True, 'ObjectiveTexts': [('Objective1', Text('Talk', '', 'k'))]}
        entry = {'PersistenceID': 'j1', 'DisplayName': Text('Bone Club', '', 'k'), 'UnlockCondition': {'UnlockType': 'EJournalEntryUnlockType::RecipeUnlocked', 'UnlockingRecipe': {'asset': 'RECIPE_Club', 'package': '/Game/RECIPE_Club'}}, 'ItemData': {'asset': 'ITEM_Club', 'package': '/Game/ITEM_Club'}}
        game = StubGame({'RSDragonwilds/Content/Gameplay/Quests/Quest_A.uasset': quest, 'RSDragonwilds/Content/UI/JournalData/Entries/Recipes/Weapons/JOURNAL_Club.uasset': entry})
        quests = extract.build_quests(game, {'QuestData': [('RSDragonwilds/Content/Gameplay/Quests/Quest_A.uasset', 0, 'QuestData')]})
        self.assertEqual(quests['states'], {'0': 'Ungiven', '1': 'Given', '2': 'Complete'})
        self.assertEqual(quests['quests'][0]['region'], 'Brynmoor')
        self.assertEqual(quests['quests'][0]['objectives'], {'Objective1': 'Talk'})
        journal = extract.build_journal(game, {'JournalEntryData': [('RSDragonwilds/Content/UI/JournalData/Entries/Recipes/Weapons/JOURNAL_Club.uasset', 0, 'JournalEntryRecipeData')]})
        record = journal['entries'][0]
        self.assertEqual((record['category'], record['group'], record['unlock'], record['item'], record['recipe']), ('Recipes', 'Recipes/Weapons', 'RecipeUnlocked', 'ITEM_Club', 'RECIPE_Club'))


@unittest.skipUnless(os.path.exists(os.path.join(WORLD, 'build.json')), 'no extracted facts')
class WorldFilesTest(unittest.TestCase):
    def load(self, name):
        with open(os.path.join(WORLD, name), encoding='utf-8') as f:
            return json.load(f)

    def test_build_records_both_apps(self):
        build = self.load('build.json')
        self.assertEqual((build['server_app'], build['client_app']), (extract.SERVER_APP, extract.CLIENT_APP))
        self.assertTrue(build['server_build'] > 0 and build['client_build'] > 0)
        self.assertRegex(build['version'], r'^\d+(\.\d+)+$')
        for name in extract.FILES:
            if name != 'build.json':
                source = self.load(name)['source']
                self.assertEqual((source['app'], source['build'], source['version']), (build['server_app'], build['server_build'], build['version']))

    def test_twelve_live_skills_with_save_ids(self):
        skills = [s for s in self.load('skills.json')['skills'] if not s['deleted']]
        self.assertEqual(len(skills), 12)
        self.assertEqual(len({s['id'] for s in skills}), 12)
        self.assertEqual(len({s['enum'] for s in skills}), 12)
        for skill in skills:
            self.assertRegex(skill['id'], r'^[A-Za-z0-9_-]{22}$')
            self.assertEqual(skill['maxLevel'], 99)
            self.assertTrue(skill['name'])

    def test_xp_curve_is_monotonic_to_max_level(self):
        xp = self.load('xp.json')
        levels = xp['xpForLevel']
        self.assertEqual(len(levels), 99)
        self.assertEqual(levels[0], 0)
        self.assertTrue(all(b > a for a, b in zip(levels[1:], levels[2:])))
        self.assertTrue(xp['row'])

    def test_ids_are_unique_where_present(self):
        for name, key in (('quests.json', 'quests'), ('journal.json', 'entries'), ('items.json', 'items'), ('recipes.json', 'recipes')):
            rows = self.load(name)[key]
            ids = [row['id'] for row in rows if row['id']]
            self.assertEqual(len(ids), len(set(ids)), name)
            self.assertTrue(all(row['asset'] for row in rows), name)


if __name__ == '__main__':
    unittest.main()
