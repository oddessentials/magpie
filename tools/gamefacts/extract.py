import argparse
import datetime
from contextlib import ExitStack, closing
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import locres
import usmap
from clockfacts import build_clock
from geography import build_geography
from iostore import Store
from pak import Pak
from properties import Decoder, Text, Unreadable
from zen import INDEX_NULL, Package, ScriptObjects, object_index

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SERVER_APP = 4019830
CLIENT_APP = 1374490
CONTAINERS = {SERVER_APP: 'RSDragonwilds-WindowsServer', CLIENT_APP: 'RSDragonwilds-Windows'}
LOCRES = 'RSDragonwilds/Content/Localization/Game/en/Game.locres'
GAME_INI = 'RSDragonwilds/Config/DefaultGame.ini'
SCAN_ROOTS = ('/Content/Gameplay/', '/Content/UI/')
CLASS_DEFAULT = 0x10
ROOT_CLASSES = ('SkillData', 'QuestData', 'JournalEntryData', 'ItemData', 'RecipeData')
FILES = ('build.json', 'skills.json', 'xp.json', 'quests.json', 'journal.json', 'items.json', 'recipes.json', 'progression.json', 'geography.json', 'clock.json')
JOURNAL_CATEGORIES = {'JournalEntryRecipeData': 'Recipes', 'JournalEntryWorldData': 'World', 'JournalEntryKnowLoreData': 'Knowledge', 'JournalEntryKnowPeopleData': 'Knowledge', 'JournalEntryKnowPlaceData': 'Knowledge', 'JournalEntryKnowTreasureData': 'Knowledge'}


def basename(path):
    return path.rsplit('/', 1)[-1].split('.')[-1]


def asset_of(value):
    if isinstance(value, dict):
        if 'asset' in value:
            return value['asset']
        if 'package' in value and isinstance(value['package'], str):
            return basename(value['package'])
        if 'export' in value:
            return value['export']
    return None


def enum_entry(value):
    if isinstance(value, str) and '::' in value:
        return value.split('::', 1)[1]
    return value


def read_manifest(paks, app):
    folder = os.path.abspath(paks)
    for _ in range(8):
        for candidate in (os.path.join(folder, 'steamapps', 'appmanifest_%d.acf' % app), os.path.join(folder, 'appmanifest_%d.acf' % app)):
            if os.path.exists(candidate):
                with open(candidate, encoding='utf-8', errors='replace') as f:
                    match = re.search(r'"buildid"\s+"(\d+)"', f.read())
                if match:
                    return int(match.group(1))
        parent = os.path.dirname(folder)
        if parent == folder:
            break
        folder = parent
    return None


def ini_value(text, section, key):
    current = None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('['):
            current = line
        elif current == section and line.startswith(key + '='):
            return line[len(key) + 1:]
    return None


class Game:
    def __init__(self, paks, app, mappings):
        self.paks = paks
        self.app = app
        self.container = CONTAINERS[app]
        self.store = Store(paks, self.container)
        self.script = ScriptObjects(self.store.script_objects())
        self.mappings = mappings
        self.pak = Pak(os.path.join(paks, self.container + '.pak'))
        self.texts = locres.read(self.pak.read(LOCRES))
        self.game_ini = self.pak.read(GAME_INI).decode('utf-8', 'replace')
        self.version = ini_value(self.game_ini, '[/Script/EngineSettings.GeneralProjectSettings]', 'ProjectVersion')
        self.build = read_manifest(paks, app)
        self.mounts = {}
        for path in self.store.paths.values():
            at = path.find('/Content/')
            if at < 0:
                continue
            prefix = path[:at + 9]
            if prefix == 'RSDragonwilds/Content/':
                self.mounts['/Game/'] = prefix
            elif prefix == 'Engine/Content/':
                self.mounts['/Engine/'] = prefix
            else:
                self.mounts['/' + path[:at].rsplit('/', 1)[-1] + '/'] = prefix
        self.tables = {}
        self.packages = {}
        self.chains = {}
        self.unreadable = 0

    def close(self):
        self.store.close()
        self.pak.close()

    def source(self):
        return dict(app=self.app, build=self.build, version=self.version, container=self.container)

    def container_path(self, package):
        for mount, prefix in self.mounts.items():
            if package.startswith(mount):
                return prefix + package[len(mount):] + '.uasset'
        return None

    def feature_of(self, path):
        match = re.match(r'RSDragonwilds/Plugins/GameFeatures/([^/]+)/Content/', path)
        return match.group(1) if match else None

    def package(self, path):
        if path not in self.packages:
            self.packages[path] = Package(self.store.read(path), self.script)
        return self.packages[path]

    def class_name(self, pkg, export):
        described = pkg.describe(export['cls'])
        if isinstance(described, str):
            return described.rsplit('.', 1)[-1]
        if isinstance(described, dict) and isinstance(described.get('package'), str):
            return basename(described['package']) + '_C'
        return None

    def chain(self, name):
        if name in self.chains:
            return self.chains[name]
        out = []
        seen = set()
        current = name
        while current is not None and current in self.mappings.structs and current not in seen:
            seen.add(current)
            out.append(current)
            current = self.mappings.structs[current][0]
        self.chains[name] = out
        return out

    def root_class(self, name):
        for ancestor in self.chain(name):
            if ancestor in ROOT_CLASSES:
                return ancestor
        return None

    def decode(self, pkg, index):
        export = pkg.exports[index]
        class_name = self.class_name(pkg, export)
        props, reader = Decoder(pkg, self.mappings).read_object(pkg.export_data(index), class_name)
        self.unreadable += sum(1 for value in props.values() if isinstance(value, Unreadable))
        if reader.u32():
            reader.raw(16)
        return class_name, props, reader

    def objects(self, path):
        pkg = self.package(path)
        found = []
        for index, export in enumerate(pkg.exports):
            if object_index(export['outer'])[0] != INDEX_NULL or export['flags'] & CLASS_DEFAULT or export['name'].startswith('Default__'):
                continue
            found.append((index, export, self.class_name(pkg, export)))
        return pkg, found

    def rows(self, path):
        pkg, found = self.objects(path)
        for index, export, class_name in found:
            if class_name not in ('DataTable', 'CurveTable'):
                continue
            _, props, reader = self.decode(pkg, index)
            decoder = Decoder(pkg, self.mappings)
            count = reader.i32()
            table = []
            if class_name == 'CurveTable':
                mode = reader.u8()
                struct_name = 'SimpleCurve' if mode == 1 else 'RichCurve'
            else:
                row_struct = props.get('RowStruct')
                struct_name = basename(row_struct) if isinstance(row_struct, str) else asset_of(row_struct)
            for _ in range(count):
                name = decoder.name(reader)
                if pkg.unversioned:
                    row = decoder.read_unversioned(reader, struct_name)
                else:
                    row = decoder.read_tagged(reader, len(reader.data))
                table.append((name, row))
            return export['name'], struct_name, table
        return None, None, []

    def string_table(self, reference):
        package = reference.split('.')[0]
        if package in self.tables:
            return self.tables[package]
        result = (basename(package), {})
        path = self.container_path(package)
        if path is not None and self.store.has(path):
            pkg, found = self.objects(path)
            for index, export, class_name in found:
                if class_name != 'StringTable':
                    continue
                _, props, reader = self.decode(pkg, index)
                namespace = reader.fstring()
                entries = {}
                for _ in range(reader.i32()):
                    key = reader.fstring()
                    entries[key] = reader.fstring()
                result = (namespace, entries)
                break
        self.tables[package] = result
        return result

    def text(self, value):
        if not isinstance(value, Text):
            return None
        if value.kind == 'table':
            namespace, entries = self.string_table(value.table)
            localized = self.texts.get(namespace, {}).get(value.key)
            return localized if localized is not None else entries.get(value.key)
        if value.kind == 'base':
            localized = self.texts.get(value.namespace or '', {}).get(value.key)
            return localized if localized is not None else value.source
        if value.kind == 'invariant':
            return value.invariant
        if value.kind == 'format':
            return self.text(value.source)
        return None

    def scan(self):
        found = {name: [] for name in ROOT_CLASSES}
        for path in sorted(self.store.paths.values()):
            if not path.endswith('.uasset') or not any(root in path for root in SCAN_ROOTS) or '/Content/Art/' in path or '/Audio/' in path:
                continue
            pkg, objects = self.objects(path)
            for index, export, class_name in objects:
                root = self.root_class(class_name) if class_name else None
                if root:
                    found[root].append((path, index, class_name))
        return found


def asset_name(path):
    return path.rsplit('/', 1)[-1][:-7]


def common(game, path, props, class_name):
    return {'id': props.get('PersistenceID'), 'asset': asset_name(path), 'class': class_name, 'feature': game.feature_of(path), 'deleted': bool(props.get('bSoftDeleted')) or '/Deleted' in path or 'Deprecated' in path}


def build_skills(game, found):
    enum = {entry: value for entry, value in game.mappings.enums.get('ESkill', [])}
    skills = []
    for path, index, class_name in found['SkillData']:
        pkg = game.package(path)
        _, props, _ = game.decode(pkg, index)
        record = common(game, path, props, class_name)
        skill_type = enum_entry(props.get('SkillType'))
        record.update(name=game.text(props.get('Name')), type=skill_type, enum=enum.get(skill_type), maxLevel=props.get('MaxLevel'), levelUp=game.text(props.get('LevelUpDescriptionText')), internalName=props.get('InternalName'))
        skills.append(record)
    skills.sort(key=lambda s: (s['deleted'], s['enum'] if s['enum'] is not None else 999, s['asset']))
    return dict(source=game.source(), enum={entry: value for entry, value in game.mappings.enums.get('ESkill', [])}, skills=skills)


def build_xp(game, found):
    handle = ini_value(game.game_ini, '[/Script/Dominion.SkillSettings]', 'XPCurveRowHandle') or ''
    table_match = re.search(r"CurveTable=\"[^']*'([^']+)'\"", handle)
    row_match = re.search(r'RowName="([^"]+)"', handle)
    table_reference = table_match.group(1) if table_match else None
    row_name = row_match.group(1) if row_match else None
    result = dict(source=game.source(), setting='[/Script/Dominion.SkillSettings] XPCurveRowHandle', table=table_reference, row=row_name, interpolation=None, xpForLevel=[], events=[])
    if table_reference:
        path = game.container_path(table_reference.split('.')[0])
        _, _, rows = game.rows(path)
        for name, row in rows:
            if name != row_name:
                continue
            result['interpolation'] = enum_entry(row.get('InterpMode'))
            levels = {}
            for key in row.get('Keys', []):
                level = int(round(key['Time']))
                if 1 <= level <= 200:
                    levels[level] = int(round(key['Value']))
            top = max(levels) if levels else 0
            result['xpForLevel'] = [levels.get(level, 0) for level in range(1, top + 1)]
    for path in sorted(game.store.paths.values()):
        if '/Content/Gameplay/Progress/XPEventTables/' not in path or not path.endswith('.uasset'):
            continue
        table, _, rows = game.rows(path)
        for name, row in rows:
            result['events'].append(dict(table=table, row=name, skills=[dict(skill=asset_of(entry.get('Skill')), xp=entry.get('XP')) for entry in row.get('SkillXPList', [])], debtSeconds=row.get('SecondsToCancelXPDebt', 0.0)))
    return result


def build_quests(game, found):
    quests = []
    for path, index, class_name in found['QuestData']:
        pkg = game.package(path)
        _, props, _ = game.decode(pkg, index)
        record = common(game, path, props, class_name)
        objectives = {}
        for key, value in props.get('ObjectiveTexts', []) or []:
            objectives[key] = game.text(value)
        region = enum_entry(props.get('QuestRegion'))
        record.update(name=game.text(props.get('QuestName')), description=game.text(props.get('QuestDescription')), region=None if region in (None, 'None', 'MAX') else region, main=bool(props.get('bIsMainQuest')), hidden=bool(props.get('bHideInQuestList')), task=bool(props.get('bIsTaskQuest')), objectives=objectives, activity=props.get('LinkedActivityID') or None, internalName=props.get('InternalName'))
        quests.append(record)
    quests.sort(key=lambda q: (q['deleted'], q['asset']))
    return dict(source=game.source(), states={str(value): entry for entry, value in game.mappings.enums.get('EQuestState', []) if not entry.endswith('_MAX')}, regions={str(value): entry for entry, value in game.mappings.enums.get('EQuestRegion', []) if entry != 'MAX'}, quests=quests)


def build_journal(game, found):
    entries = []
    for path, index, class_name in found['JournalEntryData']:
        pkg = game.package(path)
        _, props, _ = game.decode(pkg, index)
        record = common(game, path, props, class_name)
        match = re.search(r'/JournalData/Entries/(.+)/[^/]+$', path)
        group = match.group(1) if match else None
        unlock = props.get('UnlockCondition') or {}
        record.update(name=game.text(props.get('DisplayName')), category=JOURNAL_CATEGORIES.get(class_name, group.split('/')[0] if group else None), group=group, unlock=enum_entry(unlock.get('UnlockType')), item=asset_of(props.get('ItemData')) or asset_of(unlock.get('UnlockingItemData')), recipe=asset_of(props.get('RecipeData')) or asset_of(unlock.get('UnlockingRecipe')), pages=len(props.get('PageDescriptions') or []))
        entries.append(record)
    entries.sort(key=lambda e: (e['deleted'], e['category'] or '', e['asset']))
    return dict(source=game.source(), unlockTypes={str(value): entry for entry, value in game.mappings.enums.get('EJournalEntryUnlockType', []) if not entry.endswith('_MAX')}, entries=entries)


def build_items(game, found):
    items = []
    for path, index, class_name in found['ItemData']:
        pkg = game.package(path)
        _, props, _ = game.decode(pkg, index)
        record = common(game, path, props, class_name)
        category = props.get('Category')
        record.update(name=game.text(props.get('Name')), category=category.get('TagName') if isinstance(category, dict) else None, stack=props.get('MaxStackSize'), weight=props.get('Weight'), power=props.get('PowerLevel'), tier=props.get('Tier'), skill=asset_of(props.get('AssociatedSkill')) or asset_of(props.get('SkillUsed')), internalName=props.get('InternalName'))
        items.append(record)
    items.sort(key=lambda i: (i['deleted'], i['asset']))
    return dict(source=game.source(), items=items)


def build_recipes(game, found):
    recipes = []
    for path, index, class_name in found['RecipeData']:
        pkg = game.package(path)
        _, props, _ = game.decode(pkg, index)
        record = common(game, path, props, class_name)
        record.update(creates=[dict(item=asset_of(entry.get('ItemData')), count=entry.get('Count')) for entry in props.get('ItemsCreated', []) or []], consumes=[dict(item=asset_of(entry.get('ItemData')), count=entry.get('Count')) for entry in props.get('ItemsConsumed', []) or []], skill=asset_of(props.get('SkillUsedToCraft')), xp=props.get('SkillXPAwardedOnCraft'), craftTime=props.get('CraftTime'), internalName=props.get('InternalName'))
        recipes.append(record)
    recipes.sort(key=lambda r: (r['deleted'], r['asset']))
    return dict(source=game.source(), recipes=recipes)


def operand(value):
    if not isinstance(value, dict):
        return None
    kind = enum_entry(value.get('UnlockType'))
    out = dict(type=kind, condition=enum_entry(value.get('Condition')), matches=value.get('NumberOfMatchesRequired'))
    if kind == 'ItemsPickedUp':
        out['items'] = [asset_of(item) for item in value.get('Items') or []]
    elif kind == 'ActorsInteractedWith':
        out['actors'] = [asset_of(actor) for actor in value.get('Actors') or []]
    elif kind == 'SkillLevelReached':
        out['skill'] = asset_of(value.get('Skill'))
        out['level'] = value.get('RequiredSkillLevel')
    elif kind == 'AgilityCourseMedalsUnlocked':
        courses = value.get('AgilityCourseUnlockRequirements') or {}
        out['courses'] = [asset_of(course) for course in courses.get('CourseDataAssets') or []]
        out['medal'] = enum_entry(courses.get('MinimumRequiredMedal'))
    elif kind == 'Entitlement':
        out['entitlement'] = asset_of(value.get('Entitlement'))
    return out


def build_progression(game, found):
    tables = []
    for path in sorted(game.store.paths.values()):
        if not re.search(r'/Content/Gameplay/Progress/DT_Progression_[^/]+\.uasset$', path):
            continue
        table, struct_name, rows = game.rows(path)
        if struct_name != 'ProgressionBundleRow':
            continue
        entries = []
        for name, row in rows:
            query = row.get('UnlockQuery') or {}
            entries.append(dict(row=name, milestone=bool(row.get('bMilestoneUnlock')), manual=bool(row.get('bManuallyUnlocked')), condition=row.get('UnlockQueryString'), first=operand(query.get('FirstOperand')), operator=enum_entry(query.get('Operator')) if query.get('bUseSecondOperand') else None, second=operand(query.get('SecondOperand')) if query.get('bUseSecondOperand') else None, recipes=[asset_of(item) for item in row.get('UnlockedRecipes', []) or []], buildings=[asset_of(item) for item in row.get('UnlockedBuildings', []) or []], achievements=list(row.get('UnlockedAchievements', []) or []), quests=[dict(quest=asset_of(change.get('QuestData')), state=enum_entry(change.get('QuestState')) if change.get('bShouldAdvanceQuest') else None, objectives=list(change.get('QuestObjectives') or []) if change.get('bShouldSetQuestObjectives') else []) for change in row.get('ChangedQuests') or []]))
        tables.append(dict(table=table, feature=game.feature_of(path), rows=entries))
    return dict(source=game.source(), tables=tables)


def validate_build(game):
    if type(game.build) is not int or game.build <= 0:
        raise ValueError('installed Steam build is missing for app %s' % game.app)
    if not isinstance(game.version, str) or not re.fullmatch(r'\d+(\.\d+)+', game.version):
        raise ValueError('installed game version is missing for app %s' % game.app)


def build_info(game, client_build, mappings_name):
    validate_build(game)
    return dict(server_app=SERVER_APP, server_build=game.build, client_app=CLIENT_APP, client_build=client_build, version=game.version, container=game.container, mappings=mappings_name, extracted=datetime.date.today().isoformat())


def write_outputs(out, outputs):
    os.makedirs(out, exist_ok=True)
    written = []
    for name, data in outputs.items():
        target = os.path.join(out, name)
        with open(target, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')
        written.append(target)
    prettier = os.path.join(ROOT, 'node_modules', 'prettier', 'bin', 'prettier.cjs')
    if os.path.exists(prettier):
        subprocess.run(['node', prettier, '--no-config', '--single-quote', '--trailing-comma', 'none', '--print-width', '100', '--log-level', 'warn', '--write', *written], check=True)
    return written


def compare(server, client, found):
    mismatches = 0
    checked = 0
    server_tests = 0
    for root, entries in found.items():
        for path, index, class_name in entries:
            if not client.store.has(path):
                if '/gameplay/test/' in path.lower():
                    server_tests += 1
                    continue
                print('client asset missing: %s' % path)
                mismatches += 1
                continue
            try:
                _, expected, _ = server.decode(server.package(path), index)
                _, actual, _ = client.decode(client.package(path), index)
            except Exception as error:
                print('client check failed for %s: %s' % (path, error))
                mismatches += 1
                continue
            checked += 1
            expected_keys = {key.lower(): value for key, value in expected.items()}
            for key, value in actual.items():
                if isinstance(value, (int, float, str, bool)) or value is None:
                    other = expected_keys.get(key.lower())
                    if other is None and value in (0, 0.0, '', False, None, 'None'):
                        continue
                    if other != value and not (isinstance(value, float) and isinstance(other, (int, float)) and abs(value - other) < 1e-6):
                        if mismatches < 20:
                            print('mismatch %s %s: server %r client %r' % (path, key, other, value))
                        mismatches += 1
    print('client check: %d objects compared, %d mismatches' % (checked, mismatches))
    print('server-only test assets excluded from client comparison: %d' % server_tests)
    if mismatches or not checked:
        raise ValueError('client comparison failed: %d objects compared, %d mismatches' % (checked, mismatches))
    return checked


def newest_mappings():
    folder = os.path.join(ROOT, 'tools', 'rig', 'mappings')
    files = sorted(name for name in os.listdir(folder) if name.endswith('.usmap')) if os.path.isdir(folder) else []
    return os.path.join(folder, files[-1]) if files else None


def main(argv=None):
    rig = os.environ.get('MAGPIE_RIG', r'D:\dragonwilds-rig')
    client_default = os.environ.get('DRAGONWILDS_PAKS', r'D:\SteamLibrary\steamapps\common\RSDragonwilds\RSDragonwilds\Content\Paks')
    parser = argparse.ArgumentParser()
    parser.add_argument('--paks', default=os.path.join(rig, 'server', 'RSDragonwilds', 'Content', 'Paks'))
    parser.add_argument('--usmap', default=newest_mappings())
    parser.add_argument('--out', default=os.path.join(ROOT, 'web', 'src', 'lib', 'world'))
    parser.add_argument('--client-paks', default=client_default if os.path.isdir(client_default) else None)
    parser.add_argument('--no-client', action='store_true')
    args = parser.parse_args(argv)
    if args.usmap is None:
        parser.error('no mappings file; pass --usmap or add one under tools/rig/mappings')
    if args.no_client:
        args.client_paks = None
    mappings = usmap.load(args.usmap)
    with ExitStack() as resources:
        game = resources.enter_context(closing(Game(args.paks, SERVER_APP, mappings)))
        validate_build(game)
        print('reading %s build %s version %s' % (game.container, game.build, game.version))
        found = game.scan()
        for name, entries in found.items():
            print('%s: %d objects' % (name, len(entries)))
        outputs = {}
        outputs['skills.json'] = build_skills(game, found)
        outputs['xp.json'] = build_xp(game, found)
        outputs['quests.json'] = build_quests(game, found)
        outputs['journal.json'] = build_journal(game, found)
        outputs['items.json'] = build_items(game, found)
        outputs['recipes.json'] = build_recipes(game, found)
        outputs['progression.json'] = build_progression(game, found)
        outputs['geography.json'] = build_geography(game)
        outputs['clock.json'] = build_clock(game)
        client = None
        client_build = None
        if args.client_paks:
            client = resources.enter_context(closing(Game(args.client_paks, CLIENT_APP, mappings)))
            validate_build(client)
            client_build = client.build
            print('client %s build %s version %s' % (client.container, client.build, client.version))
            compare(game, client, found)
        if game.unreadable or (client is not None and client.unreadable):
            raise ValueError('extraction contains unreadable values; existing facts were preserved')
        outputs['build.json'] = build_info(game, client_build, os.path.basename(args.usmap))
        for data in outputs.values():
            if 'source' in data:
                data['source']['build'] = outputs['build.json']['server_build']
                data['source']['version'] = outputs['build.json']['version']
        written = write_outputs(args.out, outputs)
        print('unreadable values: %d' % game.unreadable)
        for target in written:
            print('wrote %s (%d bytes)' % (target, os.path.getsize(target)))


if __name__ == '__main__':
    main()
