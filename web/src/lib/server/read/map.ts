import geography from '$lib/world/geography.json';
import { contains, type MapData, type Point } from '$lib/ui/map';

const point = (values: number[]): Point => ({ x: values[0]!, y: values[1]! });
const bounds = geography.mapBounds.find((entry) => entry.priority === 0)!;
const regions = geography.regions.map((region) => ({
  id: region.id,
  name: region.name,
  group: region.tag.split('.')[2]!,
  power_level: region.powerLevel,
  boundary: region.boundary.map(point)
}));

export const worldMap: MapData = {
  build: geography.source.build,
  version: geography.source.version,
  bounds: { min: point(bounds.min), max: point(bounds.max) },
  regions,
  landmarks: [
    ...geography.lodestones.map((stone) => ({
      id: stone.id,
      name: stone.name,
      kind: 'lodestone' as const,
      position: point(stone.position),
      regions: stone.regions
    })),
    ...geography.bosses.flatMap((boss) =>
      boss.spawns.map((spawn, index) => ({
        id: `${boss.asset}-${index}`,
        name: boss.name,
        kind: 'boss' as const,
        position: point(spawn.position),
        regions: regions.filter((r) => contains(point(spawn.position), r.boundary)).map((r) => r.id)
      }))
    )
  ]
};
