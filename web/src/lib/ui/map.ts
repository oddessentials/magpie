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
