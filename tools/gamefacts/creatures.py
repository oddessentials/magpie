from geography import Reader, field


def creature_paths(game):
    return sorted(path for path in game.store.paths.values() if path.endswith('.uasset') and any(root in path for root in ('/Gameplay/', '/AI/')) and '/Audio/' not in path and '/Art/' not in path)


def build_creatures(game):
    reader = Reader(game)
    creatures = []
    for path in creature_paths(game):
        pkg = game.package(path)
        for index, export in enumerate(pkg.exports):
            if not export['name'].startswith('Default__'):
                continue
            if 'AIDataAsset' not in reader.lineage(pkg, export['cls']):
                continue
            props = reader.inherited(pkg, index)
            creatures.append({
                'id': field(props, 'PersistenceID'),
                'asset': path.rsplit('/', 1)[-1][:-7],
                'class': export['name'][len('Default__'):],
                'feature': game.feature_of(path),
                'deleted': bool(field(props, 'bSoftDeleted')) or '/Deleted' in path,
                'name': game.text(field(props, 'AIName')),
                'boss': field(props, 'bIsBoss') is True,
                'internalName': field(props, 'InternalName'),
            })
        game.packages.pop(path, None)
    creatures.sort(key=lambda c: (c['deleted'], c['asset']))
    return dict(source=game.source(), creatures=creatures)


def link_journal(journal, creatures):
    by_class = {creature['class']: creature['id'] for creature in creatures['creatures']}
    for entry in journal['entries']:
        cls = entry.pop('aiClass', None)
        entry['creature'] = by_class.get(cls) if cls else None
    return journal
