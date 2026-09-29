import { and, desc, gte, isNotNull } from 'drizzle-orm';
import geography from '$lib/world/geography.json';
import { contains, type MapData, type Point } from '$lib/ui/map';
import type { Database } from '../db/client';
import { deaths } from '../db/schema';
import { savedCharacters } from './characters';
import { playerRef, playersById, type Schemas } from './common';
import { latestWorldSave } from './saves';

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

export async function mapLive(db: Database, now = new Date()): Promise<Schemas['MapLive']> {
  const since = new Date(now.getTime() - 24 * 3600_000);
  const [characters, world, died] = await Promise.all([
    savedCharacters(db),
    latestWorldSave(db),
    db
      .select()
      .from(deaths)
      .where(and(gte(deaths.at, since), isNotNull(deaths.x), isNotNull(deaths.y)))
      .orderBy(desc(deaths.at))
      .limit(200)
  ]);
  const people = await playersById(
    db,
    died.map((death) => death.playerId)
  );
  return {
    players: characters.flatMap(({ player, save }) =>
      save.x !== null && save.y !== null
        ? [
            {
              player: playerRef(player),
              position: { x: save.x, y: save.y },
              saved_at: save.savedAt.toISOString()
            }
          ]
        : []
    ),
    bases: (world?.bases ?? []).map((base) => ({
      position: { x: base.x, y: base.y },
      pieces: base.pieces,
      unfinished: base.unfinished,
      saved_at: world!.savedAt.toISOString()
    })),
    deaths: died.flatMap((death) => {
      const person = people.get(death.playerId);
      if (person?.hidden) return [];
      return [
        {
          player: person ? playerRef(person) : null,
          position: { x: death.x!, y: death.y! },
          at: death.at.toISOString()
        }
      ];
    })
  };
}
