import math

from zen import INDEX_EXPORT, INDEX_PACKAGE, object_index

WORLD = 'RSDragonwilds/Content/Maps/World/L_World'


def field(props, name, default=None):
    return next((value for key, value in props.items() if key.lower() == name.lower()), default)


def transform(point, props):
    location = field(props, 'RelativeLocation', [0, 0, 0])
    scale = field(props, 'RelativeScale3D', [1, 1, 1])
    pitch, yaw, roll = field(props, 'RelativeRotation', [0, 0, 0])
    if ((abs(pitch) > 1e-6 or abs(roll) > 1e-6) and any(point)) or field(props, 'AttachParent'):
        raise ValueError('map root has an unsupported tilted or attached transform')
    x, y, z = [point[i] * scale[i] for i in range(3)]
    angle = math.radians(yaw)
    return [round(location[0] + x * math.cos(angle) - y * math.sin(angle), 3), round(location[1] + x * math.sin(angle) + y * math.cos(angle), 3), round(location[2] + z, 3)]


def contains(point, polygon):
    inside = False
    x, y = point[:2]
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


class Reader:
    def __init__(self, game):
        self.game = game
        self.defaults = {}
        self.classes = {}

    def lineage(self, pkg, value):
        key = (pkg.name, value)
        if key in self.classes:
            return self.classes[key]
        kind, index = object_index(value)
        chain = []
        if kind == INDEX_EXPORT:
            export = pkg.exports[index]
            chain = [export['name']] + self.lineage(pkg, export['super'])
        elif kind == INDEX_PACKAGE:
            resolved = self.imported(pkg.describe(value))
            if resolved:
                other, index = resolved
                chain = self.lineage(other, index)
        else:
            name = pkg.describe(value)
            if isinstance(name, str):
                chain = self.game.chain(name.rsplit('.', 1)[-1])
        self.classes[key] = chain
        return chain

    def imported(self, reference):
        if not isinstance(reference, dict) or not isinstance(reference.get('package'), str):
            return None
        path = self.game.container_path(reference['package'])
        if not path or not self.game.store.has(path):
            return None
        pkg = self.game.package(path)
        for index, export in enumerate(pkg.exports):
            if reference.get('hash') == export['hash'] or reference.get('asset') == export['name']:
                return pkg, index
        raise ValueError('unresolved export in %s: %r' % (path, reference))

    def inherited(self, pkg, index, seen=None):
        key = (pkg.name, index)
        if key in self.defaults:
            return self.defaults[key]
        seen = set() if seen is None else seen
        if key in seen:
            raise ValueError('cyclic object template')
        seen = seen | {key}
        export = pkg.exports[index]
        kind, parent = object_index(export['template'])
        base = None
        if kind == INDEX_EXPORT:
            base = pkg, parent
        elif kind == INDEX_PACKAGE:
            base = self.imported(pkg.describe(export['template']))
        props = dict(self.inherited(*base, seen) if base else {})
        props.update(self.game.decode(pkg, index)[1])
        self.defaults[key] = props
        return props

    def class_defaults(self, reference):
        resolved = self.imported(reference)
        if resolved is None:
            return {}
        pkg, index = resolved
        for i, export in enumerate(pkg.exports):
            if export['name'].startswith('Default__') and object_index(export['cls']) == (INDEX_EXPORT, index):
                return self.inherited(pkg, i)
        return {}

    def component(self, pkg, actor, reference):
        if not isinstance(reference, dict) or 'export' not in reference:
            raise ValueError('missing component reference')
        found = [i for i, export in enumerate(pkg.exports) if export['name'] == reference['export'] and object_index(export['outer']) == (INDEX_EXPORT, actor)]
        if len(found) != 1:
            raise ValueError('ambiguous or missing component %s' % reference['export'])
        return self.game.decode(pkg, found[0])[1]

    def position(self, pkg, index, props):
        return transform([0, 0, 0], self.component(pkg, index, field(props, 'RootComponent')))


def provenance(path, export, cls):
    return dict(package=path, actor=export['name'], actorClass=cls)


def build_geography(game):
    if not game.build or not game.version:
        raise ValueError('map facts require a verified installed build and version')
    reader = Reader(game)
    paths = sorted(path for path in game.store.paths.values() if (path == WORLD + '.umap' or path.startswith(WORLD + '/_Generated_/')) and path.endswith('.umap'))
    if WORLD + '.umap' not in paths:
        raise ValueError('L_World and its generated cells are required')
    regions, lodestones, bounds, weather, spawn_points, altars = [], [], [], [], [], []
    for path in paths:
        pkg = game.package(path)
        for index, export in enumerate(pkg.exports):
            cls = game.class_name(pkg, export)
            chain = reader.lineage(pkg, export['cls']) if cls else []
            if not any(name in chain for name in ('MapRegion', 'WorldLodestone', 'MapBackground', 'DynamicRegionalWeather', 'AISpawnPoint', 'BossAltar')):
                continue
            props = game.decode(pkg, index)[1]
            evidence = provenance(path, export, cls)
            if 'MapRegion' in chain:
                spline = reader.component(pkg, index, field(props, 'BoundarySpline'))
                points = field(spline, 'SplineCurves', {}).get('Position', {}).get('Points', [])
                if not points or any(p.get('InterpMode') != 'CIM_Linear' for p in points):
                    raise ValueError('region boundary is not a verified linear polygon')
                regions.append(dict(id=field(props, 'RegionID'), name=game.text(field(props, 'RegionName')), tag=field(props, 'MapRegionTag', {}).get('TagName'), powerLevel=field(props, 'PowerLevel'), boundary=[transform(p['OutVal'], spline)[:2] for p in points], **evidence))
            elif 'WorldLodestone' in chain:
                merged = {**reader.class_defaults(pkg.describe(export['cls'])), **props}
                lodestones.append(dict(id=field(props, 'GameplayObjectRegistryIdentifier'), name=game.text(field(merged, 'DisplayName')), position=reader.position(pkg, index, props), **evidence))
            elif 'MapBackground' in chain:
                box = reader.component(pkg, index, field(props, 'AreaBounds'))
                extent = field(box, 'BoxExtent')
                corners = [transform([x * extent[0], y * extent[1], z * extent[2]], box) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
                bounds.append(dict(min=[min(p[i] for p in corners) for i in range(3)], max=[max(p[i] for p in corners) for i in range(3)], priority=field(props, 'BackgroundPriority', 0), **evidence))
            elif 'DynamicRegionalWeather' in chain:
                weather.append(dict(id=field(props, 'PersistenceName'), regionTags=field(props, 'RegionTags', []), **evidence))
            elif 'AISpawnPoint' in chain:
                merged = {**reader.class_defaults(pkg.describe(export['cls'])), **props}
                ai = field(merged, 'AIClass')
                ai_props = reader.class_defaults(ai)
                data = field(ai_props, 'AIDataClass')
                if data:
                    spawn_points.append(dict(data=data, position=reader.position(pkg, index, props), **evidence))
            elif 'BossAltar' in chain:
                altars.append(dict(id=field(props, 'InternalName'), position=reader.position(pkg, index, props), **evidence))
        game.packages.pop(path, None)
    bosses = []
    for path in sorted(game.store.paths.values()):
        if not path.endswith('.uasset') or not any(root in path for root in ('/Gameplay/', '/AI/')) or '/Audio/' in path or '/Art/' in path:
            continue
        pkg = game.package(path)
        for index, export in enumerate(pkg.exports):
            cls = game.class_name(pkg, export)
            if not cls or 'AIDataAsset' not in reader.lineage(pkg, export['cls']):
                continue
            props = reader.inherited(pkg, index)
            if field(props, 'bIsBoss') is not True or field(props, 'bSoftDeleted'):
                continue
            bosses.append(dict(id=field(props, 'PersistenceID'), asset=path.rsplit('/', 1)[-1][:-7], name=game.text(field(props, 'AIName')), internalName=field(props, 'InternalName'), spawns=[{key: value for key, value in spawn.items() if key != 'data'} for spawn in spawn_points if spawn['data'].get('package') == pkg.name], package=path))
    regions.sort(key=lambda r: r['id'])
    for stone in lodestones:
        stone['regions'] = [r['id'] for r in regions if contains(stone['position'], r['boundary'])]
    return dict(source=game.source(), map='L_World', coordinateSource='Root component RelativeLocation and region BoundarySpline, in game coordinates', scannedPackages=len(paths), regions=regions, lodestones=lodestones, mapBounds=bounds, weather=weather, bosses=sorted(bosses, key=lambda b: b['asset']), bossAltars=altars)
