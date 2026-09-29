import layerFacts from '$lib/world/layers.json';
import type { Schemas } from './common';
import { creaturesByAsset, itemName, liveJournal, questsByAsset } from './lookup';

type MapLayer = Schemas['MapLayer'];
type Group = Schemas['MapLayerGroup'];
export type LayerName = Schemas['MapLayerName'];

export const layerNames: LayerName[] = [
  'resources',
  'fishing',
  'chests',
  'lore',
  'spawns',
  'quests',
  'shrines',
  'teleporters',
  'dungeons',
  'vents'
];

const placeholder = 'DEFAULT DISPLAY NAME';
const xy = (point: (number | null)[]) => [Number(point[0]), Number(point[1])];
const journalByAsset = new Map(liveJournal.map((entry) => [entry.asset, entry]));

function groups(layer: LayerName): Group[] {
  switch (layer) {
    case 'resources':
      return layerFacts.resources.map((group) => {
        const items = group.items
          .map((entry) => entry.item)
          .filter((item): item is string => !!item);
        const name = group.name && group.name !== placeholder ? group.name : itemName(items[0]);
        return {
          id: group.class,
          name: name ?? null,
          kind: group.kind,
          ref: null,
          items: [...new Set(items)],
          points: group.points.map(xy)
        };
      });
    case 'fishing':
      return layerFacts.fishing.map((group) => ({
        id: group.class,
        name: group.name,
        kind: group.tool ? group.tool.split('.').pop()! : null,
        ref: null,
        items: group.catches,
        points: group.points.map(xy)
      }));
    case 'chests':
      return layerFacts.chests.map((group) => ({
        id: group.class,
        name: group.profile,
        kind: group.buried ? 'buried' : 'chest',
        ref: null,
        items: [],
        points: group.points.map(xy)
      }));
    case 'lore':
      return layerFacts.lore.map((entry, index) => ({
        id: `${entry.journal}-${index}`,
        name: (entry.journal && journalByAsset.get(entry.journal)?.name) ?? null,
        kind: null,
        ref: entry.journal,
        items: [],
        points: [xy(entry.point)]
      }));
    case 'spawns':
      return layerFacts.spawns.map((group) => {
        const creature = creaturesByAsset.get(group.creature);
        return {
          id: group.creature,
          name: creature?.name ?? null,
          kind: creature?.boss ? 'boss' : null,
          ref: creature?.id ?? null,
          items: [],
          points: group.points.map(xy)
        };
      });
    case 'quests':
      return layerFacts.quests.map((entry, index) => ({
        id: `${entry.quest ?? 'quest'}-${index}`,
        name: (entry.quest && questsByAsset.get(entry.quest)?.name) ?? entry.name,
        kind: entry.type,
        ref: entry.quest,
        items: [],
        points: [xy(entry.point)]
      }));
    case 'shrines':
      return layerFacts.shrines.map((entry, index) => ({
        id: `shrine-${index}`,
        name: entry.name,
        kind: null,
        ref: null,
        items: [],
        points: [xy(entry.point)]
      }));
    case 'teleporters':
      return layerFacts.teleporters.map((entry, index) => ({
        id: `teleporter-${index}`,
        name: entry.name,
        kind: entry.destination,
        ref: null,
        items: [],
        points: [xy(entry.point)]
      }));
    case 'dungeons':
      return layerFacts.dungeons.map((entry, index) => ({
        id: `dungeon-${index}`,
        name: entry.name,
        kind: entry.tag,
        ref: null,
        items: [],
        points: [xy(entry.point)]
      }));
    case 'vents':
      return [
        {
          id: 'vents',
          name: null,
          kind: null,
          ref: null,
          items: [],
          points: layerFacts.vents.map(xy)
        }
      ];
  }
}

export const findable = {
  item: new Set([
    ...layerFacts.resources.flatMap((group) =>
      group.items.map((entry) => entry.item).filter((item): item is string => Boolean(item))
    ),
    ...layerFacts.fishing.flatMap((group) => group.catches)
  ]),
  creature: new Set(layerFacts.spawns.map((group) => group.creature)),
  lore: new Set(
    layerFacts.lore.map((entry) => entry.journal).filter((asset): asset is string => Boolean(asset))
  )
};

const cache = new Map<LayerName, MapLayer>();

export function isLayerName(value: string): value is LayerName {
  return (layerNames as string[]).includes(value);
}

export function mapLayer(layer: LayerName): MapLayer {
  let found = cache.get(layer);
  if (!found) {
    found = {
      layer,
      build: layerFacts.source.build,
      version: layerFacts.source.version,
      groups: groups(layer)
    };
    cache.set(layer, found);
  }
  return found;
}
