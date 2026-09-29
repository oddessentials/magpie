import type { components } from '$lib/api/types';

export type MapData = components['schemas']['WorldMap'];
export type Point = components['schemas']['MapPoint'];
export type Bounds = MapData['bounds'];
export type View = { x: number; y: number; size: number };
export const mapSize = 900;

export function contains(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

export function boundsOf(points: Point[]): Bounds {
  if (!points.length || points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y)))
    throw new Error('Map points must be finite and nonempty.');
  return {
    min: { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)) },
    max: { x: Math.max(...points.map((p) => p.x)), y: Math.max(...points.map((p) => p.y)) }
  };
}

export function square(bounds: Bounds, padding = 0): Bounds {
  const size =
    Math.max(1, bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) * (1 + padding * 2);
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cy = (bounds.min.y + bounds.max.y) / 2;
  return {
    min: { x: cx - size / 2, y: cy - size / 2 },
    max: { x: cx + size / 2, y: cy + size / 2 }
  };
}

export function project(point: Point, bounds: Bounds): Point {
  const area = square(bounds);
  const scale = mapSize / (area.max.x - area.min.x);
  return { x: (point.x - area.min.x) * scale, y: (area.max.y - point.y) * scale };
}

export function unproject(point: Point, bounds: Bounds): Point {
  const area = square(bounds);
  const scale = (area.max.x - area.min.x) / mapSize;
  return { x: area.min.x + point.x * scale, y: area.max.y - point.y * scale };
}

export function clampView(view: View): View {
  const size = Math.max(90, Math.min(mapSize, view.size));
  return {
    size,
    x: Math.max(0, Math.min(mapSize - size, view.x)),
    y: Math.max(0, Math.min(mapSize - size, view.y))
  };
}

export function zoom(view: View, factor: number, anchor: Point = { x: 0.5, y: 0.5 }): View {
  const size = Math.max(90, Math.min(mapSize, view.size * factor));
  return clampView({
    size,
    x: view.x + (view.size - size) * anchor.x,
    y: view.y + (view.size - size) * anchor.y
  });
}

export function labelPoint(polygon: Point[]): Point {
  const bounds = boundsOf(polygon);
  const center = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 };
  if (contains(center, polygon)) return center;
  let best = polygon[0]!;
  let distance = Infinity;
  for (let x = 1; x < 20; x++)
    for (let y = 1; y < 20; y++) {
      const point = {
        x: bounds.min.x + ((bounds.max.x - bounds.min.x) * x) / 20,
        y: bounds.min.y + ((bounds.max.y - bounds.min.y) * y) / 20
      };
      const next = Math.hypot(point.x - center.x, point.y - center.y);
      if (next < distance && contains(point, polygon)) {
        best = point;
        distance = next;
      }
    }
  return best;
}

export function mapCharts(world: MapData) {
  const outside = world.regions.filter((region) =>
    region.boundary.every(
      (p) =>
        p.x < world.bounds.min.x ||
        p.x > world.bounds.max.x ||
        p.y < world.bounds.min.y ||
        p.y > world.bounds.max.y
    )
  );
  return [
    { id: 'main', name: 'Main world', bounds: square(world.bounds) },
    ...(outside.length
      ? [
          {
            id: 'outer',
            name:
              outside.find((region) => region.name === 'Scorned Wilderness')?.name ??
              'Outer regions',
            bounds: square(boundsOf(outside.flatMap((r) => r.boundary)), 0.08)
          }
        ]
      : []),
    {
      id: 'all',
      name: 'All known locations',
      bounds: square(
        boundsOf([
          ...world.regions.flatMap((r) => r.boundary),
          ...world.landmarks.map((p) => p.position)
        ]),
        0.04
      )
    }
  ];
}

export type LayerName = components['schemas']['MapLayerName'];
export type LayerGroup = components['schemas']['MapLayerGroup'];

export const layerOrder: LayerName[] = [
  'resources',
  'fishing',
  'spawns',
  'chests',
  'lore',
  'quests',
  'dungeons',
  'shrines',
  'teleporters',
  'vents'
];

export const layerStyles: Record<LayerName, { label: string; color: string; size: number }> = {
  resources: { label: 'Resources', color: '#b7e36a', size: 4 },
  fishing: { label: 'Fishing spots', color: '#6cc7f0', size: 5 },
  spawns: { label: 'Creatures', color: '#f07a6a', size: 4 },
  chests: { label: 'Chests', color: '#f0c24b', size: 5 },
  lore: { label: 'Lore', color: '#efe0b8', size: 5 },
  quests: { label: 'Quest places', color: '#f5a3ff', size: 5 },
  dungeons: { label: 'Dungeons', color: '#ff9f45', size: 7 },
  shrines: { label: 'Shrines', color: '#7ef0c8', size: 6 },
  teleporters: { label: 'Teleporters', color: '#b99cff', size: 5 },
  vents: { label: 'Anima vents', color: '#d2f7ff', size: 4 }
};

export function isLayer(value: string): value is LayerName {
  return (layerOrder as string[]).includes(value);
}

export type Find =
  | { kind: 'item' | 'creature' | 'lore'; key: string }
  | { kind: 'name'; layer: LayerName; key: string };

export function parseFind(text: string | null | undefined): Find | null {
  if (!text) return null;
  const [kind, ...rest] = text.split(':');
  if (kind === 'name') {
    const [layer, ...name] = rest;
    return layer && isLayer(layer) && name.length
      ? { kind: 'name', layer, key: name.join(':') }
      : null;
  }
  const key = rest.join(':');
  return (kind === 'item' || kind === 'creature' || kind === 'lore') && key ? { kind, key } : null;
}

export function formatFind(find: Find): string {
  return find.kind === 'name' ? `name:${find.layer}:${find.key}` : `${find.kind}:${find.key}`;
}

export function findLayers(find: Find): LayerName[] {
  if (find.kind === 'name') return [find.layer];
  if (find.kind === 'item') return ['resources', 'fishing'];
  return find.kind === 'creature' ? ['spawns'] : ['lore'];
}

export function matchesFind(layer: LayerName, group: LayerGroup, find: Find): boolean {
  if (!findLayers(find).includes(layer)) return false;
  switch (find.kind) {
    case 'item':
      return group.items.includes(find.key);
    case 'creature':
      return group.id === find.key;
    case 'lore':
      return group.ref === find.key;
    case 'name':
      return (group.name ?? '') === find.key;
  }
}

export function dotPath(points: Point[]): string {
  return points.map((point) => `M${point.x.toFixed(1)} ${point.y.toFixed(1)}h0`).join('');
}

export function nameLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export function groupLabel(layer: LayerName, group: Pick<LayerGroup, 'name' | 'kind'>): string {
  if (group.name) return nameLabel(group.name);
  if (layer === 'dungeons' && group.kind) return group.kind.split('.').slice(2).join(' ');
  return layerStyles[layer].label;
}

export function searchableNames(
  layers: Iterable<[LayerName, { groups: LayerGroup[] }]>
): { layer: LayerName; name: string; spots: number }[] {
  const names = new Map<string, { layer: LayerName; name: string; spots: number }>();
  for (const [layer, data] of layers) {
    if (layer === 'vents') continue;
    for (const group of data.groups) {
      if (!group.name) continue;
      const key = `${layer}:${group.name}`;
      const known = names.get(key);
      if (known) known.spots += group.points.length;
      else names.set(key, { layer, name: group.name, spots: group.points.length });
    }
  }
  return [...names.values()];
}
