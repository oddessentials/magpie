import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  clampView,
  contains,
  labelPoint,
  mapCharts,
  mapSize,
  project,
  square,
  unproject,
  zoom
} from '../../src/lib/ui/map';
import { worldMap } from '../../src/lib/server/read/map';
import build from '../../src/lib/world/build.json';
import fixture from '../../fixtures/api/world.json';

describe('original map geometry', () => {
  it('projects game X right and Y up with an invertible, equal scale', () => {
    const bounds = { min: { x: -50, y: 20 }, max: { x: 150, y: 120 } };
    const area = square(bounds);
    expect(project({ x: area.min.x, y: area.max.y }, bounds)).toEqual({ x: 0, y: 0 });
    expect(project({ x: area.max.x, y: area.min.y }, bounds)).toEqual({ x: mapSize, y: mapSize });
    for (const point of [
      { x: 0, y: 0 },
      { x: -80.5, y: 67.25 },
      { x: 1e6, y: -1e6 }
    ]) {
      const back = unproject(project(point, bounds), bounds);
      expect(back.x).toBeCloseTo(point.x, 6);
      expect(back.y).toBeCloseTo(point.y, 6);
    }
    expect(() => boundsOf([])).toThrow();
    expect(() => boundsOf([{ x: NaN, y: 0 }])).toThrow();
  });

  it('keeps zoom anchors stable and constrains panning at every zoom', () => {
    const view = { x: 100, y: 150, size: 600 };
    const anchor = { x: 0.2, y: 0.8 };
    const next = zoom(view, 0.5, anchor);
    expect(next.x + next.size * anchor.x).toBe(view.x + view.size * anchor.x);
    expect(next.y + next.size * anchor.y).toBe(view.y + view.size * anchor.y);
    expect(clampView({ x: -100, y: 10000, size: 1 })).toEqual({ x: 0, y: 810, size: 90 });
    expect(zoom(view, 100)).toEqual({ x: 0, y: 0, size: mapSize });
  });

  it('places labels inside the verified polygons, including concave regions', () => {
    for (const region of worldMap.regions) {
      expect(contains(labelPoint(region.boundary), region.boundary), region.name).toBe(true);
    }
    const concave = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 10 },
      { x: 0, y: 10 }
    ];
    expect(contains({ x: 5, y: 5 }, concave)).toBe(false);
    expect(contains(labelPoint(concave), concave)).toBe(true);
  });

  it('keeps outer regions and distant spawns reachable without distorting the main world', () => {
    const charts = mapCharts(worldMap);
    expect(charts.map((chart) => chart.id)).toEqual(['main', 'outer', 'all']);
    const all = charts.at(-1)!.bounds;
    for (const point of [
      ...worldMap.regions.flatMap((r) => r.boundary),
      ...worldMap.landmarks.map((m) => m.position)
    ]) {
      const shown = project(point, all);
      expect(shown.x).toBeGreaterThanOrEqual(0);
      expect(shown.x).toBeLessThanOrEqual(mapSize);
      expect(shown.y).toBeGreaterThanOrEqual(0);
      expect(shown.y).toBeLessThanOrEqual(mapSize);
    }
    expect(charts[0]!.bounds).toEqual(worldMap.bounds);
  });

  it('uses current build provenance and joins saved POI identifiers to fixed landmarks', () => {
    expect(worldMap.build).toBe(build.server_build);
    expect(worldMap.version).toBe(build.version);
    expect(worldMap.regions).toHaveLength(31);
    const stone = worldMap.landmarks.find((entry) => entry.id === fixture.save.discoveries[0]!.id)!;
    expect(stone.kind).toBe('lodestone');
    expect(stone.regions).toContain(15);
    expect(JSON.stringify(worldMap)).not.toMatch(/_Generated_|\.uasset|PlayerId|owner_guid/);
  });
});
