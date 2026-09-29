import collections
import json

from geography import WORLD, Reader, field
from zen import INDEX_EXPORT, INDEX_PACKAGE, object_index

RESOURCES = (('OreNode', 'ore'), ('DestructibleMiningRock', 'rock'), ('GatherableResource', 'gatherable'), ('HarvestableResource', 'harvestable'), ('SalvageableResource', 'salvage'))


def classify(cls, chain):
    for native, kind in RESOURCES:
        if native in chain:
            return 'resource', kind
    if 'FishingNodeV2' in chain:
        return 'fishing', None
    if 'DiggableChest' in chain:
        return 'chest', True
    if 'WorldChest' in chain:
        return 'chest', False
    if 'QuestLocation' in chain:
        return 'quest', None
    if 'HealthShrine' in chain:
        return 'shrine', None
    if 'AISpawnPoint' in chain:
        return 'spawn', None
    if cls == 'BP_LoreItem_C':
        return 'lore', None
    if cls == 'Dungeon':
        return 'dungeon', None
    if cls == 'BP_AnimaVent_C':
        return 'vent', None
    if cls.startswith('BP_InteractablePlayerTeleporter'):
        return 'teleporter', None
    return None, None


def point(position, cell):
    return [round(position[0]), round(position[1]), round(position[2]), cell]


def asset_name(value):
    if not isinstance(value, dict):
        return None
    if isinstance(value.get('package'), str):
        return value['package'].rsplit('/', 1)[-1]
    if isinstance(value.get('asset'), str):
        asset = value['asset']
        return asset[:-2] if asset.endswith('_C') else asset
    return None


def drop_entry(entry):
    query = entry.get('RequiredTagQuery') or {}
    chance = entry.get('ProbabilityOfDrop')
    return dict(item=asset_name(entry.get('ItemDataClass')), min=entry.get('MinToDrop'), max=entry.get('MaxToDrop'), chance=round(chance, 4) if isinstance(chance, float) else chance, tags=[tag.get('TagName') for tag in query.get('TagDictionary') or []])


def items_within(value):
    found = []
    if isinstance(value, dict):
        for key, inner in value.items():
            if key == 'ItemDataClass':
                name = asset_name(inner)
                if name:
                    found.append(name)
            else:
                found += items_within(inner)
    elif isinstance(value, list):
        for inner in value:
            found += items_within(inner)
    return found


class Layers:
    def __init__(self, game):
        self.game = game
        self.reader = Reader(game)

    def key(self, reference):
        return json.dumps(reference, sort_keys=True, default=str)

    def defaults(self, reference):
        return self.reader.class_defaults(reference) if isinstance(reference, dict) else {}

    def package_drops(self, pkg):
        entries = []
        for index, export in enumerate(pkg.exports):
            if self.game.class_name(pkg, export) != 'ItemDropComponent':
                continue
            entries += [drop_entry(entry) for entry in field(self.reader.inherited(pkg, index), 'ItemsToDrop') or []]
        return entries

    def drops(self, reference):
        resolved = self.reader.imported(reference)
        seen = set()
        while resolved and resolved[0].name not in seen:
            pkg, index = resolved
            seen.add(pkg.name)
            entries = self.package_drops(pkg)
            if entries:
                return entries
            parent = pkg.exports[index]['super']
            kind, target = object_index(parent)
            if kind == INDEX_PACKAGE:
                resolved = self.reader.imported(pkg.describe(parent))
            elif kind == INDEX_EXPORT:
                resolved = (pkg, target)
            else:
                resolved = None
        return []

    def resource(self, reference, kind):
        defaults = self.defaults(reference)
        item = asset_name(field(defaults, 'ItemData'))
        if item:
            items = [dict(item=item, min=None, max=None, chance=None, tags=[])]
        else:
            items = self.drops(reference)
            spawned = field(defaults, 'DestructibleActorToSpawn')
            if not items and isinstance(spawned, dict):
                items = self.drops(spawned)
        return dict(kind=kind, name=self.game.text(field(defaults, 'DisplayName')), items=items)

    def fishing(self, reference):
        defaults = self.defaults(reference)
        catches, junk = [], []
        resolved = self.reader.imported(field(defaults, 'ResourceData'))
        if resolved:
            pkg, index = resolved
            data = self.game.decode(pkg, index)[1]
            for species in field(data, 'CatchableSpecies') or []:
                found = self.reader.imported(species)
                if found:
                    catches += items_within(field(self.game.decode(*found)[1], 'Info'))
            junk = [dict(item=asset_name(entry.get('ItemData')), weight=entry.get('ProbabilityWeight')) for entry in field(data, 'CatchableJunk') or []]
        tool = field(defaults, 'CompatibleToolCategory') or {}
        return dict(name=self.game.text(field(defaults, 'DisplayNameText')), tool=tool.get('TagName'), powerLevel=field(defaults, 'PowerLevel'), catches=list(dict.fromkeys(catches)), junk=junk)

    def chest(self, reference, buried):
        profile = field(self.defaults(reference), 'ChestRespawnProfile') or {}
        return dict(buried=buried, profileTable=asset_name(profile.get('DataTable')), profile=profile.get('RowName'))

    def spawn(self, reference, props):
        merged = {**self.defaults(reference), **props}
        creature = asset_name(field(self.defaults(field(merged, 'AIClass')), 'AIDataClass'))
        duration = field(merged, 'RespawnDuration') or {}
        return creature, field(merged, 'PowerLevel'), duration.get('Days') if field(merged, 'bShouldRespawn') else None

    def chest_profiles(self, tables):
        profiles = {}
        for table in sorted(name for name in tables if name):
            path = next((p for p in self.game.store.paths.values() if p.endswith('/' + table + '.uasset')), None)
            if path is None:
                raise ValueError('chest respawn table %s is missing' % table)
            rows = {}
            for row, data in self.game.rows(path)[2]:
                respawn = data.get('InGameRespawnTime') or {}
                loot = data.get('LootRollHandle') or {}
                trigger = data.get('RespawnTrigger')
                rows[row] = dict(respawnDays=respawn.get('Days'), trigger=trigger.split('::', 1)[1] if isinstance(trigger, str) and '::' in trigger else trigger, loot=loot.get('RowName'))
            profiles[table] = rows
        return profiles


def build_layers(game):
    if not game.build or not game.version:
        raise ValueError('map facts require a verified installed build and version')
    layers = Layers(game)
    paths = sorted(path for path in game.store.paths.values() if (path == WORLD + '.umap' or path.startswith(WORLD + '/_Generated_/')) and path.endswith('.umap'))
    if WORLD + '.umap' not in paths:
        raise ValueError('L_World and its generated cells are required')
    cells = []
    resources, fishing, chests, spawns = {}, {}, {}, {}
    lore, quests, shrines, teleporters, dungeons, vents = [], [], [], [], [], []
    skipped = collections.Counter()
    info = {}
    for path in paths:
        pkg = game.package(path)
        cell = None
        for index, export in enumerate(pkg.exports):
            cls = game.class_name(pkg, export)
            if not cls or export['name'].startswith('Default__'):
                continue
            chain = layers.reader.lineage(pkg, export['cls'])
            group, detail = classify(cls, chain)
            if group is None:
                continue
            props = game.decode(pkg, index)[1]
            try:
                position = layers.reader.position(pkg, index, props)
            except ValueError:
                skipped[cls] += 1
                continue
            if cell is None:
                cell = len(cells)
                cells.append(path)
            at = point(position, cell)
            reference = pkg.describe(export['cls'])
            key = layers.key(reference)
            if group == 'resource':
                if key not in info:
                    info[key] = layers.resource(reference, detail)
                resources.setdefault((cls, key), dict(info[key], cls=cls, points=[]))['points'].append(at)
            elif group == 'fishing':
                if key not in info:
                    info[key] = layers.fishing(reference)
                fishing.setdefault((cls, key), dict(info[key], cls=cls, points=[]))['points'].append(at)
            elif group == 'chest':
                if key not in info:
                    info[key] = layers.chest(reference, detail)
                chests.setdefault((cls, key), dict(info[key], cls=cls, points=[]))['points'].append(at)
            elif group == 'spawn':
                creature, power, respawn = layers.spawn(reference, props)
                if creature:
                    spawns.setdefault(creature, dict(creature=creature, points=[]))['points'].append(at + [power, respawn])
            elif group == 'lore':
                lore.append(dict(journal=asset_name(field(props, 'JournalEntry')), point=at))
            elif group == 'quest':
                merged = {**layers.defaults(reference), **props}
                quests.append(dict(quest=asset_name(field(merged, 'Quest')), name=field(merged, 'QuestLocationName'), type=field(merged, 'Type'), radius=field(merged, 'Radius'), shown=field(merged, 'bShownByDefault'), point=at))
            elif group == 'shrine':
                shrines.append(dict(id=field(props, 'UniqueShrineIdentifier'), name=game.text(field(layers.defaults(reference), 'DisplayName')), point=at))
            elif group == 'teleporter':
                name = field(props, 'DisplayName') or field(layers.defaults(reference), 'DisplayName')
                teleporters.append(dict(destination=field(props, 'TeleportDestinationName'), name=game.text(name), point=at))
            elif group == 'dungeon':
                tag = field(props, 'DungeonTag') or {}
                dungeons.append(dict(id=field(props, 'Guid'), name=game.text(field(props, 'DungeonUserVisibleName')), tag=tag.get('TagName'), point=at))
            elif group == 'vent':
                vents.append(at)
        game.packages.pop(path, None)
    rename = lambda record: {'class' if key == 'cls' else key: value for key, value in record.items()}
    profiles = layers.chest_profiles({chest['profileTable'] for chest in chests.values()})
    for chest in chests.values():
        chest['profileFound'] = chest['profile'] in profiles.get(chest['profileTable'], {})
    return dict(
        source=game.source(),
        map='L_World',
        cells=cells,
        resources=sorted((rename(r) for r in resources.values()), key=lambda r: (r['kind'], r['class'])),
        fishing=sorted((rename(r) for r in fishing.values()), key=lambda r: r['class']),
        chests=sorted((rename(r) for r in chests.values()), key=lambda r: r['class']),
        chestProfiles=profiles,
        spawns=sorted(spawns.values(), key=lambda s: s['creature']),
        lore=sorted(lore, key=lambda l: (l['journal'] or '', l['point'])),
        quests=sorted(quests, key=lambda q: (q['quest'] or '', q['name'] or '')),
        shrines=sorted(shrines, key=lambda s: s['id'] or ''),
        teleporters=sorted(teleporters, key=lambda t: (t['destination'] or '', t['point'])),
        dungeons=sorted(dungeons, key=lambda d: d['name'] or ''),
        vents=sorted(vents),
        skipped=dict(sorted(skipped.items())),
    )
