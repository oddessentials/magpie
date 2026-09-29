<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api/client';
  import type { components } from '$lib/api/types';
  import {
    boundsOf,
    contains,
    clampView,
    dotPath,
    findLayers,
    formatFind,
    groupLabel,
    isLayer,
    labelPoint,
    layerOrder,
    layerStyles,
    mapCharts,
    mapSize,
    matchesFind,
    nameLabel,
    parseFind,
    project,
    searchableNames,
    zoom,
    type Find,
    type LayerGroup,
    type LayerName,
    type MapData,
    type Point,
    type View
  } from './map';
  import Freshness from './Freshness.svelte';
  import { formatNumber } from './format';
  import { areaKey, areaLabel } from './names';
  import { withParams } from './query';
  import Time from './Time.svelte';

  type Schemas = components['schemas'];

  let {
    world,
    save,
    live = null,
    findLabel = null
  }: {
    world: MapData;
    save: Schemas['WorldSave'] | null;
    live?: Schemas['MapLive'] | null;
    findLabel?: string | null;
  } = $props();

  const initial = untrack(() => page.url.searchParams);
  let ready = $state(false);
  let chartId = $state('main');
  let selected = $state<number | null>(null);
  let selectedPlace = $state<string | null>(null);
  let selectedGroup = $state<{ layer: LayerName; group: LayerGroup } | null>(null);
  let selectedLive = $state<{ kind: 'player' | 'base' | 'death'; index: number } | null>(null);
  let view = $state<View>({ x: 0, y: 0, size: mapSize });
  let showLabels = $state(true);
  let showStones = $state(true);
  let showBosses = $state(true);
  let showPlayers = $state(true);
  let showBases = $state(true);
  let showDeaths = $state(true);
  let width = $state(640);
  let search = $state('');
  let find = $state<Find | null>(parseFind(initial.get('find')));
  let findName = $state<string | null>(untrack(() => findLabel));
  let area = $state<string | null>(initial.get('area'));
  let fitted = '';
  const active = new SvelteSet<LayerName>((initial.get('layers') ?? '').split(',').filter(isLayer));
  const loaded = new SvelteMap<LayerName, Schemas['MapLayer']>();
  const loading = new SvelteSet<LayerName>();
  const failed = new SvelteSet<LayerName>();
  let pane: HTMLButtonElement;
  const pointers = new SvelteMap<number, Point>();
  let gesture: { view: View; center: Point; distance: number } | null = null;
  let moved = false;
  const charts = $derived(mapCharts(world));
  const chart = $derived(charts.find((entry) => entry.id === chartId) ?? charts[0]!);
  const k = $derived(view.size / Math.max(width, 200));
  const region = $derived(world.regions.find((entry) => entry.id === selected) ?? null);
  const place = $derived(world.landmarks.find((entry) => entry.id === selectedPlace) ?? null);
  const discoveries = $derived(
    new Map((save?.discoveries ?? []).map((entry) => [entry.id.toUpperCase(), entry.characters]))
  );
  const discovered = (id: string) => discoveries.get(id.toUpperCase());
  const regions = $derived(
    world.regions.map((entry) => {
      const points = entry.boundary.map((point) => project(point, chart.bounds));
      return {
        ...entry,
        points: points.map((p) => `${p.x},${p.y}`).join(' '),
        label: project(labelPoint(entry.boundary), chart.bounds),
        bounds: boundsOf(points),
        inArea: area !== null && areaKey(entry.group) === areaKey(area)
      };
    })
  );
  const landmarks = $derived(
    world.landmarks.map((entry) => ({ ...entry, at: project(entry.position, chart.bounds) }))
  );
  const unknown = $derived(
    (save?.discoveries ?? []).filter(
      (entry) =>
        !world.landmarks.some((landmark) => landmark.id.toUpperCase() === entry.id.toUpperCase())
    )
  );
  const groupColors: Record<string, string> = {
    Brynmoor: '#41634e',
    Ghornfell: '#686746',
    Fellhollow: '#595478',
    DowdunReach: '#5c7385',
    UmbralSands: '#8a6a43',
    ScornedWilderness: '#795457'
  };
  const toPoint = (raw: number[]) => ({ x: raw[0]!, y: raw[1]! });
  const drawn = $derived.by(() => {
    const out: {
      key: string;
      layer: LayerName;
      group: LayerGroup;
      points: Point[];
      path: string;
      matched: boolean;
    }[] = [];
    for (const layer of layerOrder) {
      const data = loaded.get(layer);
      if (!data) continue;
      const searched = find !== null && findLayers(find).includes(layer);
      if (!active.has(layer) && !searched) continue;
      data.groups.forEach((group, index) => {
        const matched = searched && matchesFind(layer, group, find!);
        if (searched && !matched) return;
        const points = group.points.map((raw) => project(toPoint(raw), chart.bounds));
        out.push({
          key: `${layer}:${group.id}:${index}`,
          layer,
          group,
          points,
          path: dotPath(points),
          matched
        });
      });
    }
    return out;
  });
  const matchedPoints = $derived(
    drawn.filter((entry) => entry.matched).reduce((sum, entry) => sum + entry.points.length, 0)
  );
  const livePlayers = $derived(
    (live?.players ?? []).map((entry) => ({ ...entry, xy: project(entry.position, chart.bounds) }))
  );
  const liveBases = $derived(
    (live?.bases ?? []).map((entry, index) => ({
      ...entry,
      index,
      xy: project(entry.position, chart.bounds)
    }))
  );
  const liveDeaths = $derived(
    (live?.deaths ?? []).map((entry, index) => ({
      ...entry,
      index,
      xy: project(entry.position, chart.bounds)
    }))
  );
  const searchable = $derived(searchableNames(loaded));
  const needle = $derived(search.trim().toLowerCase());
  const results = $derived(
    needle.length < 2
      ? []
      : searchable
          .filter((entry) => nameLabel(entry.name).toLowerCase().includes(needle))
          .sort(
            (a, b) =>
              Number(!a.name.toLowerCase().startsWith(needle)) -
                Number(!b.name.toLowerCase().startsWith(needle)) ||
              b.spots - a.spots ||
              a.name.localeCompare(b.name)
          )
          .slice(0, 8)
  );

  onMount(() => {
    ready = true;
  });

  function ensure(layer: LayerName) {
    untrack(() => {
      if (loaded.has(layer) || loading.has(layer)) return;
      loading.add(layer);
      failed.delete(layer);
      api
        .getMapLayer(layer)
        .then((data) => loaded.set(layer, data))
        .catch(() => failed.add(layer))
        .finally(() => loading.delete(layer));
    });
  }

  $effect(() => {
    if (!ready) return;
    for (const layer of active) ensure(layer);
    if (find) for (const layer of findLayers(find)) ensure(layer);
  });

  $effect(() => {
    if (!ready) return;
    const key = find ? `find:${formatFind(find)}` : area ? `area:${area}` : '';
    if (!key || key === untrack(() => fitted)) return;
    const raw = find
      ? drawn.filter((entry) => entry.matched).flatMap((entry) => entry.group.points.map(toPoint))
      : world.regions
          .filter((entry) => areaKey(entry.group) === areaKey(area))
          .flatMap((entry) => entry.boundary);
    if (!raw.length) return;
    fitted = key;
    untrack(() => fit(raw));
  });

  $effect(() => {
    if (!ready) return;
    const layers = layerOrder.filter((layer) => active.has(layer));
    const next = withParams(page.url, {
      layers: layers.join(','),
      find: find ? formatFind(find) : null,
      area
    });
    if (next !== `${page.url.pathname}${page.url.search}`) {
      try {
        replaceState(next, {});
      } catch {
        return;
      }
    }
  });

  function fit(raw: Point[]) {
    const middle = raw[Math.floor(raw.length / 2)]!;
    const containing =
      charts.find(
        (item) =>
          item.id !== 'all' &&
          raw.every(
            (point) =>
              point.x >= item.bounds.min.x &&
              point.x <= item.bounds.max.x &&
              point.y >= item.bounds.min.y &&
              point.y <= item.bounds.max.y
          )
      ) ??
      charts.find(
        (item) =>
          item.id !== 'all' &&
          middle.x >= item.bounds.min.x &&
          middle.x <= item.bounds.max.x &&
          middle.y >= item.bounds.min.y &&
          middle.y <= item.bounds.max.y
      ) ??
      charts.at(-1)!;
    chartId = containing.id;
    const box = boundsOf(raw.map((point) => project(point, containing.bounds)));
    const size = Math.max(140, Math.max(box.max.x - box.min.x, box.max.y - box.min.y) * 1.3);
    view = clampView({
      x: (box.min.x + box.max.x - size) / 2,
      y: (box.min.y + box.max.y - size) / 2,
      size
    });
  }

  function clearSelection() {
    selectedPlace = null;
    selected = null;
    selectedGroup = null;
    selectedLive = null;
  }

  function reset() {
    view = { x: 0, y: 0, size: mapSize };
  }

  function changeChart() {
    clearSelection();
    reset();
  }

  function selectRegion(id: number) {
    clearSelection();
    selected = id;
    const entry = world.regions.find((item) => item.id === id);
    if (!entry) return;
    const center = labelPoint(entry.boundary);
    const containing =
      charts.find(
        (item) =>
          item.id !== 'all' &&
          center.x >= item.bounds.min.x &&
          center.x <= item.bounds.max.x &&
          center.y >= item.bounds.min.y &&
          center.y <= item.bounds.max.y
      ) ?? charts.at(-1)!;
    chartId = containing.id;
    const box = boundsOf(entry.boundary.map((point) => project(point, containing.bounds)));
    const size = Math.max(130, Math.max(box.max.x - box.min.x, box.max.y - box.min.y) * 1.6);
    view = clampView({
      x: (box.min.x + box.max.x - size) / 2,
      y: (box.min.y + box.max.y - size) / 2,
      size
    });
  }

  function selectPlace(id: string) {
    const entry = world.landmarks.find((item) => item.id === id);
    if (!entry) return;
    clearSelection();
    selectedPlace = id;
    const containing =
      charts.find(
        (item) =>
          item.id !== 'all' &&
          entry.position.x >= item.bounds.min.x &&
          entry.position.x <= item.bounds.max.x &&
          entry.position.y >= item.bounds.min.y &&
          entry.position.y <= item.bounds.max.y
      ) ?? charts.at(-1)!;
    chartId = containing.id;
    const point = project(entry.position, containing.bounds);
    view = clampView({ x: point.x - 90, y: point.y - 90, size: 180 });
    if (entry.kind === 'boss') showBosses = true;
    else showStones = true;
  }

  function toggleLayer(layer: LayerName, on: boolean) {
    if (on) active.add(layer);
    else active.delete(layer);
    if (!on && selectedGroup?.layer === layer) selectedGroup = null;
  }

  function startSearch() {
    for (const layer of ['resources', 'fishing', 'spawns', 'lore', 'quests', 'dungeons'] as const) {
      ensure(layer);
    }
  }

  function findByName(entry: { layer: LayerName; name: string }) {
    find = { kind: 'name', layer: entry.layer, key: entry.name };
    findName = nameLabel(entry.name);
    search = '';
    clearSelection();
  }

  function clearFind() {
    find = null;
    findName = null;
    fitted = '';
  }

  function clearArea() {
    area = null;
    fitted = '';
  }

  function pan(dx: number, dy: number) {
    view = clampView({ ...view, x: view.x + dx * view.size, y: view.y + dy * view.size });
  }

  function key(event: KeyboardEvent) {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => pan(-0.15, 0),
      ArrowRight: () => pan(0.15, 0),
      ArrowUp: () => pan(0, -0.15),
      ArrowDown: () => pan(0, 0.15),
      '+': () => {
        view = zoom(view, 0.75);
      },
      '=': () => {
        view = zoom(view, 0.75);
      },
      '-': () => {
        view = zoom(view, 1.4);
      },
      Home: reset
    };
    if (actions[event.key]) {
      event.preventDefault();
      actions[event.key]!();
    }
  }

  function pointer(event: PointerEvent): Point {
    const rect = pane.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    };
  }

  function metrics() {
    const [a, b] = [...pointers.values()];
    return b
      ? {
          center: { x: (a!.x + b.x) / 2, y: (a!.y + b.y) / 2 },
          distance: Math.hypot(a!.x - b.x, a!.y - b.y)
        }
      : { center: a!, distance: 0 };
  }

  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, pointer(event));
    pane.setPointerCapture(event.pointerId);
    gesture = { view: { ...view }, ...metrics() };
    moved = false;
  }

  function move(event: PointerEvent) {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, pointer(event));
    const current = metrics();
    const dx = current.center.x - gesture.center.x;
    const dy = current.center.y - gesture.center.y;
    if (Math.hypot(dx, dy) * width > 4 || pointers.size > 1) moved = true;
    const next =
      gesture.distance > 0 && current.distance > 0
        ? zoom(gesture.view, gesture.distance / current.distance, gesture.center)
        : gesture.view;
    view = clampView({ ...next, x: next.x - dx * next.size, y: next.y - dy * next.size });
  }

  function up(event: PointerEvent) {
    pointers.delete(event.pointerId);
    gesture = pointers.size ? { view: { ...view }, ...metrics() } : null;
    if (pane.hasPointerCapture(event.pointerId)) pane.releasePointerCapture(event.pointerId);
  }

  function nearest<T extends { xy: Point }>(entries: T[], point: Point, reach: number) {
    let best: T | null = null;
    let distance = reach;
    for (const entry of entries) {
      const next = Math.hypot(entry.xy.x - point.x, entry.xy.y - point.y);
      if (next <= distance) {
        best = entry;
        distance = next;
      }
    }
    return best;
  }

  function pick(event: MouseEvent) {
    if (event.detail === 0) {
      selectRegion(selected ?? world.regions[0]!.id);
      return;
    }
    if (moved) return;
    const rect = pane.getBoundingClientRect();
    const point = {
      x: view.x + ((event.clientX - rect.left) / rect.width) * view.size,
      y: view.y + ((event.clientY - rect.top) / rect.height) * view.size
    };
    const liveHit = nearest(
      [
        ...(showPlayers
          ? livePlayers.map((entry, index) => ({ kind: 'player' as const, index, xy: entry.xy }))
          : []),
        ...(showBases
          ? liveBases.map((entry) => ({ kind: 'base' as const, index: entry.index, xy: entry.xy }))
          : []),
        ...(showDeaths
          ? liveDeaths.map((entry) => ({
              kind: 'death' as const,
              index: entry.index,
              xy: entry.xy
            }))
          : [])
      ],
      point,
      12 * k
    );
    if (liveHit) {
      clearSelection();
      selectedLive = { kind: liveHit.kind, index: liveHit.index };
      return;
    }
    const marker = landmarks.find(
      (entry) =>
        ((entry.kind === 'boss' && showBosses) || (entry.kind === 'lodestone' && showStones)) &&
        Math.hypot(entry.at.x - point.x, entry.at.y - point.y) <= 14 * k
    );
    if (marker) {
      clearSelection();
      selectedPlace = marker.id;
      return;
    }
    const spot = nearest(
      drawn.flatMap((entry) =>
        entry.points.map((xy) => ({ xy, layer: entry.layer, group: entry.group }))
      ),
      point,
      10 * k
    );
    if (spot) {
      clearSelection();
      selectedGroup = { layer: spot.layer, group: spot.group };
      return;
    }
    clearSelection();
    const candidates = regions.filter(
      (entry) =>
        point.x >= entry.bounds.min.x &&
        point.x <= entry.bounds.max.x &&
        point.y >= entry.bounds.min.y &&
        point.y <= entry.bounds.max.y
    );
    const item = candidates.reverse().find((entry) =>
      contains(
        point,
        entry.boundary.map((p) => project(p, chart.bounds))
      )
    );
    if (item) selected = item.id;
  }
</script>

<section class="atlas card overflow-hidden" aria-label="Interactive atlas">
  <div class="atlas-toolbar flex flex-wrap items-end gap-3 border-b border-line p-4">
    <label class="flex min-w-40 flex-1 flex-col gap-1 text-xs text-ink-muted"
      >Map view
      <select class="input" bind:value={chartId} onchange={changeChart} disabled={!ready}>
        {#each charts as entry (entry.id)}<option value={entry.id}>{entry.name}</option>{/each}
      </select>
    </label>
    <label class="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-muted"
      >Find a region
      <select
        class="input"
        value={selected ?? ''}
        onchange={(event) => {
          if (event.currentTarget.value) selectRegion(Number(event.currentTarget.value));
          else {
            selected = null;
            reset();
          }
        }}
        disabled={!ready}
      >
        <option value="">All regions</option>
        {#each world.regions as entry (entry.id)}<option value={entry.id}>{entry.name}</option
          >{/each}
      </select>
    </label>
    <div class="flex gap-1" aria-label="Map zoom">
      <button
        class="btn"
        aria-label="Zoom in"
        disabled={!ready || view.size <= 90}
        onclick={() => {
          view = zoom(view, 0.7);
        }}>+</button
      >
      <button
        class="btn"
        aria-label="Zoom out"
        disabled={!ready || view.size >= mapSize}
        onclick={() => {
          view = zoom(view, 1.4);
        }}>−</button
      >
      <button class="btn" disabled={!ready} onclick={reset}>Reset view</button>
    </div>
  </div>
  <div class="atlas-grid">
    <div class="min-w-0">
      <button
        type="button"
        disabled={!ready}
        class="map-window"
        bind:this={pane}
        bind:clientWidth={width}
        aria-label="World map. Arrow keys pan, plus and minus zoom, Home resets. Activate to focus a region."
        tabindex="0"
        onkeydown={key}
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
        onlostpointercapture={up}
        onclick={pick}
      >
        <svg
          viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`}
          role="img"
          aria-label={`${chart.name}, ${world.regions.length} regions and fixed landmarks`}
        >
          <defs>
            <pattern id="atlas-grid" width="50" height="50" patternUnits="userSpaceOnUse"
              ><path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke="#b8c7ad"
                stroke-opacity="0.08"
                stroke-width="0.8"
              /></pattern
            >
            <pattern id="atlas-grain" width="17" height="19" patternUnits="userSpaceOnUse"
              ><circle cx="3" cy="4" r="0.7" fill="#eadbc0" opacity="0.09" /><circle
                cx="12"
                cy="15"
                r="0.5"
                fill="#eadbc0"
                opacity="0.12"
              /></pattern
            >
          </defs>
          <rect width={mapSize} height={mapSize} fill="#172820" />
          <rect width={mapSize} height={mapSize} fill="url(#atlas-grid)" />
          <g class="coast" aria-hidden="true">
            {#each regions as entry (entry.id)}
              <polygon
                points={entry.points}
                fill="none"
                stroke="#d9c898"
                stroke-opacity="0.55"
                stroke-linejoin="round"
                stroke-width={7 * k}
              />
            {/each}
          </g>
          {#each regions as entry (entry.id)}
            <polygon
              points={entry.points}
              fill={groupColors[entry.group] ?? '#4c665a'}
              fill-opacity={selected === entry.id || entry.inArea ? 0.95 : 0.65}
              stroke={selected === entry.id || entry.inArea ? '#f7df9e' : '#b4bd97'}
              stroke-opacity={selected === entry.id || entry.inArea ? 1 : 0.45}
              stroke-width={(selected === entry.id ? 2.5 : entry.inArea ? 1.8 : 0.8) * k}
            />
            <polygon points={entry.points} fill="url(#atlas-grain)" />
          {/each}
          {#each drawn as entry (entry.key)}
            {#if entry.matched}
              <path
                d={entry.path}
                fill="none"
                stroke="#fff4c8"
                stroke-opacity="0.9"
                stroke-linecap="round"
                stroke-width={(layerStyles[entry.layer].size + 5) * k}
              />
            {/if}
            <path
              class="spots"
              d={entry.path}
              fill="none"
              stroke={layerStyles[entry.layer].color}
              stroke-opacity={selectedGroup?.group === entry.group ? 1 : 0.85}
              stroke-linecap="round"
              stroke-width={(layerStyles[entry.layer].size +
                (selectedGroup?.group === entry.group ? 3 : 0)) *
                k}
              ><title
                >{groupLabel(entry.layer, entry.group)} · {layerStyles[entry.layer].label}</title
              ></path
            >
          {/each}
          {#if showLabels}
            {#each regions as entry (entry.id)}
              {#if entry.id === selected || entry.inArea || ((entry.bounds.max.x - entry.bounds.min.x) / k > 70 && (entry.bounds.max.y - entry.bounds.min.y) / k > 34)}
                <text
                  x={Math.min(
                    mapSize - entry.name.length * 4 * k,
                    Math.max(entry.name.length * 4 * k, entry.label.x)
                  )}
                  y={entry.label.y}
                  text-anchor="middle"
                  dominant-baseline="middle"
                  font-size={13 * k}
                  stroke-width={2 * k}
                  class:selected={entry.id === selected}>{entry.name}</text
                >
              {/if}
            {/each}
          {/if}
          {#each landmarks as entry (entry.id)}
            {#if (entry.kind === 'lodestone' && showStones) || (entry.kind === 'boss' && showBosses)}
              <g transform={`translate(${entry.at.x} ${entry.at.y}) scale(${k})`}>
                <title
                  >{entry.name} · {entry.kind === 'boss'
                    ? 'fixed spawn'
                    : discovered(entry.id)
                      ? 'discovered in the save'
                      : 'fixed landmark'}</title
                >
                {#if entry.kind === 'lodestone'}
                  {#if discovered(entry.id)}<circle
                      r="13"
                      fill="#ead7a0"
                      fill-opacity="0.22"
                      stroke="#ead7a0"
                      stroke-width="1"
                    />{/if}
                  <path
                    d="M 0 -8 L 6 0 0 8 -6 0 Z"
                    fill={discovered(entry.id) ? '#f5d786' : '#8ed5bc'}
                    stroke="#16271f"
                    stroke-width="2"
                  />
                {:else}<path
                    d="M -6 -6 L 6 6 M -6 6 L 6 -6"
                    stroke="#f5b995"
                    stroke-width="3"
                  />{/if}
              </g>
            {/if}
          {/each}
          {#if showBases}
            {#each liveBases as entry (entry.index)}
              <g transform={`translate(${entry.xy.x} ${entry.xy.y}) scale(${k})`}>
                <title>Base · {entry.pieces} pieces</title>
                <path
                  d="M -8 2 L 0 -7 L 8 2 L 8 9 L -8 9 Z"
                  fill="#f5d786"
                  stroke="#16271f"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
              </g>
            {/each}
          {/if}
          {#if showDeaths}
            {#each liveDeaths as entry (entry.index)}
              <g transform={`translate(${entry.xy.x} ${entry.xy.y}) scale(${k})`}>
                <title>{entry.player?.name ?? 'Someone'} died here</title>
                <path
                  d="M -5 -5 L 5 5 M -5 5 L 5 -5"
                  stroke="#16271f"
                  stroke-width="5"
                  stroke-linecap="round"
                />
                <path
                  d="M -5 -5 L 5 5 M -5 5 L 5 -5"
                  stroke="#ff6b6b"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />
              </g>
            {/each}
          {/if}
          {#if showPlayers}
            {#each livePlayers as entry (entry.player.id)}
              <g transform={`translate(${entry.xy.x} ${entry.xy.y}) scale(${k})`}>
                <title>{entry.player.name} · last saved position</title>
                <circle r="6" fill="#ffffff" stroke="#16271f" stroke-width="2.5" />
                <text class="player-name" x="10" y="0" dominant-baseline="middle" font-size="12"
                  >{entry.player.name}</text
                >
              </g>
            {/each}
          {/if}
        </svg>
        <span class="map-corner" aria-hidden="true">Y ↑ &nbsp; X →</span>
        <span class="map-scale" aria-hidden="true">{Math.round((mapSize / view.size) * 100)}%</span>
      </button>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
        <p class="text-xs text-ink-muted">Drag or pinch to explore. Arrow keys pan; + / − zoom.</p>
        <div class="flex gap-1" aria-label="Map pan">
          {#each [{ label: 'left', dx: -0.2, dy: 0, icon: '←' }, { label: 'up', dx: 0, dy: -0.2, icon: '↑' }, { label: 'down', dx: 0, dy: 0.2, icon: '↓' }, { label: 'right', dx: 0.2, dy: 0, icon: '→' }] as direction (direction.label)}
            <button
              class="btn"
              aria-label={`Pan ${direction.label}`}
              disabled={!ready}
              onclick={() => pan(direction.dx, direction.dy)}>{direction.icon}</button
            >
          {/each}
        </div>
      </div>
    </div>
    <aside class="atlas-notes flex flex-col gap-5 p-5" aria-label="Map details">
      <div>
        {#if selectedGroup}
          <p class="eyebrow">{layerStyles[selectedGroup.layer].label}</p>
          <h2 class="mt-2 font-display text-2xl text-ink">
            {groupLabel(selectedGroup.layer, selectedGroup.group)}
          </h2>
          <p class="mt-2 text-sm text-ink-muted">
            {formatNumber(selectedGroup.group.points.length)}
            {selectedGroup.group.points.length === 1 ? 'place' : 'places'} in the game build.
          </p>
          {#if selectedGroup.group.name}
            <button
              class="btn mt-3"
              disabled={!ready}
              onclick={() =>
                findByName({ layer: selectedGroup!.layer, name: selectedGroup!.group.name! })}
              >Show only these</button
            >
          {/if}
        {:else if selectedLive}
          <p class="eyebrow">From the last save</p>
          {#if selectedLive.kind === 'player' && livePlayers[selectedLive.index]}
            {@const entry = livePlayers[selectedLive.index]!}
            <h2 class="mt-2 font-display text-2xl text-ink">{entry.player.name}</h2>
            <p class="mt-2 text-sm text-ink-muted">
              Last saved position, <Time at={entry.saved_at} mode="relative" />.
            </p>
          {:else if selectedLive.kind === 'base' && liveBases[selectedLive.index]}
            {@const entry = liveBases[selectedLive.index]!}
            <h2 class="mt-2 font-display text-2xl text-ink">A base</h2>
            <p class="mt-2 text-sm text-ink-muted">
              {formatNumber(entry.pieces)} building pieces{entry.unfinished
                ? `, ${formatNumber(entry.unfinished)} unfinished`
                : ''}.
            </p>
          {:else if selectedLive.kind === 'death' && liveDeaths[selectedLive.index]}
            {@const entry = liveDeaths[selectedLive.index]!}
            <h2 class="mt-2 font-display text-2xl text-ink">
              {entry.player?.name ?? 'Someone'} died here
            </h2>
            <p class="mt-2 text-sm text-ink-muted"><Time at={entry.at} mode="relative" /></p>
          {/if}
        {:else if find}
          <p class="eyebrow">Finding</p>
          <h2 class="mt-2 font-display text-2xl text-ink">{findName ?? find.key}</h2>
          <p class="mt-2 text-sm text-ink-muted">
            {findLayers(find).some((layer) => loading.has(layer))
              ? 'Reading the map layers…'
              : matchedPoints
                ? `${formatNumber(matchedPoints)} ${matchedPoints === 1 ? 'place' : 'places'} in the game build, ringed on the map.`
                : 'No map layer places this.'}
          </p>
          <button class="btn mt-3" onclick={clearFind}>Clear</button>
        {:else}
          <p class="eyebrow">
            {place
              ? 'Fixed landmark'
              : region
                ? 'Selected region'
                : area
                  ? 'Area'
                  : 'Beyond the familiar'}
          </p>
          <h2 class="mt-2 font-display text-2xl text-ink">
            {place?.name ?? region?.name ?? (area ? areaLabel(area) : 'The wilds, charted')}
          </h2>
          <p class="mt-2 text-sm text-ink-muted">
            {place
              ? place.kind === 'boss'
                ? 'A fixed spawn location from the game build.'
                : 'A fixed lodestone from the game build.'
              : region
                ? `Region ${region.id}${region.power_level === null ? '' : ` · Power level ${region.power_level}`}`
                : area
                  ? `${regions.filter((entry) => entry.inArea).length} regions, outlined in gold.`
                  : `${world.regions.length} regions. ${world.landmarks.filter((entry) => entry.kind === 'lodestone').length} fixed lodestones. A world worth returning to.`}
          </p>
          {#if region}<button
              class="btn mt-3"
              onclick={() => selectRegion(region.id)}
              disabled={!ready}>Focus region</button
            >{/if}
          {#if area && !region && !place}<button class="btn mt-3" onclick={clearArea}>Clear</button
            >{/if}
        {/if}
      </div>
      <div class="flex flex-col gap-2">
        <label class="flex flex-col gap-1 text-xs text-ink-muted"
          >Find on the map
          <input
            class="field"
            type="search"
            placeholder="Copper, Imaru, lore…"
            disabled={!ready}
            bind:value={search}
            onfocus={startSearch}
            oninput={startSearch}
          />
        </label>
        {#if results.length}
          <ul class="flex flex-col gap-1" aria-label="Places that match">
            {#each results as entry (`${entry.layer}:${entry.name}`)}
              <li>
                <button
                  type="button"
                  class="flex w-full items-baseline justify-between gap-2 rounded-md border border-line px-2.5 py-1.5 text-left text-sm hover:border-accent"
                  onclick={() => findByName(entry)}
                >
                  <span class="min-w-0 truncate"
                    ><span style:color={layerStyles[entry.layer].color} aria-hidden="true">●</span>
                    {nameLabel(entry.name)}</span
                  >
                  <span class="shrink-0 text-xs text-ink-muted"
                    >{layerStyles[entry.layer].label} · {formatNumber(entry.spots)}</span
                  >
                </button>
              </li>
            {/each}
          </ul>
        {:else if needle.length >= 2 && !loading.size}
          <p class="text-xs text-ink-muted">Nothing on the map matches.</p>
        {/if}
      </div>
      <fieldset class="flex flex-col gap-2 text-sm">
        <legend class="rail mb-3">Map layers</legend>
        <label class="flex items-center gap-3"
          ><input type="checkbox" disabled={!ready} bind:checked={showLabels} /> Region names</label
        >
        <label class="flex items-center gap-3"
          ><input type="checkbox" disabled={!ready} bind:checked={showStones} /><span
            class="text-[#8ed5bc]"
            aria-hidden="true">◆</span
          > Fixed lodestones</label
        >
        <label class="flex items-center gap-3"
          ><input type="checkbox" disabled={!ready} bind:checked={showBosses} /><span
            class="text-[#f5b995]"
            aria-hidden="true">✕</span
          > Boss spawn locations</label
        >
        {#each layerOrder as layer (layer)}
          {@const data = loaded.get(layer)}
          <label class="flex items-center gap-3"
            ><input
              type="checkbox"
              disabled={!ready}
              checked={active.has(layer)}
              onchange={(event) => toggleLayer(layer, event.currentTarget.checked)}
            /><span style:color={layerStyles[layer].color} aria-hidden="true">●</span>
            {layerStyles[layer].label}
            <span class="ml-auto text-xs text-ink-muted"
              >{#if loading.has(layer)}loading…{:else if failed.has(layer)}unavailable{:else if data && active.has(layer)}{formatNumber(
                  data.groups.reduce((sum, group) => sum + group.points.length, 0)
                )}{/if}</span
            ></label
          >
        {/each}
      </fieldset>
      {#if live}
        <fieldset class="flex flex-col gap-2 text-sm">
          <legend class="rail mb-3">From the last save</legend>
          <label class="flex items-center gap-3"
            ><input type="checkbox" disabled={!ready} bind:checked={showPlayers} /><span
              class="text-white"
              aria-hidden="true">●</span
            >
            Players
            <span class="ml-auto text-xs text-ink-muted">{live.players.length}</span></label
          >
          <label class="flex items-center gap-3"
            ><input type="checkbox" disabled={!ready} bind:checked={showBases} /><span
              class="text-[#f5d786]"
              aria-hidden="true">⌂</span
            >
            Bases
            <span class="ml-auto text-xs text-ink-muted">{live.bases.length}</span></label
          >
          <label class="flex items-center gap-3"
            ><input type="checkbox" disabled={!ready} bind:checked={showDeaths} /><span
              class="text-[#ff6b6b]"
              aria-hidden="true">✕</span
            >
            Deaths today
            <span class="ml-auto text-xs text-ink-muted">{live.deaths.length}</span></label
          >
          <Freshness
            source="save"
            at={live.players.reduce<string | null>(
              (latest, entry) => (!latest || entry.saved_at > latest ? entry.saved_at : latest),
              null
            )}
          />
        </fieldset>
      {/if}
      <div class="border-t border-line pt-4">
        <h3 class="rail">Saved discoveries</h3>
        <div class="mt-2"><Freshness source="save" at={save?.saved_at} /></div>
        <p class="mt-2 text-sm text-ink-muted">
          {save?.discoveries == null
            ? 'Discovery data is not available in this save.'
            : `${save.discoveries.length} recorded ${save.discoveries.length === 1 ? 'place' : 'places'}. Gold rings mark known lodestones found by saved characters.`}
        </p>
      </div>
      <p class="mt-auto border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
        Original cartography from Dragonwilds {world.version}, build {world.build}. Region
        boundaries, fixed locations and map layers are game facts. Coordinates use game X and Y;
        boundaries may overlap.
      </p>
    </aside>
  </div>
</section>

<section class="card mt-5 p-5" aria-label="Landmark directory">
  <h2 class="rail">Places to return to</h2>
  <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each world.landmarks.filter((entry) => entry.kind === 'lodestone') as stone (stone.id)}
      <li class="text-sm">
        <p class="font-semibold text-accent">◆ {stone.name}</p>
        <p class="mt-1 text-ink-muted">
          {stone.regions
            .map((id) => world.regions.find((entry) => entry.id === id)?.name ?? String(id))
            .join(' / ')}
        </p>
        <p class="mt-2 text-xs">
          {discovered(stone.id)
            ? `${formatNumber(discovered(stone.id)!)} saved characters`
            : save?.discoveries == null
              ? 'Discovery unknown'
              : 'Not recorded in the save'}
        </p>
        {#if stone.regions[0]}<button
            class="mt-2 text-xs text-accent underline"
            onclick={() => selectRegion(stone.regions[0]!)}
            disabled={!ready}>Show region</button
          >{/if}
      </li>
    {/each}
  </ul>
  <details class="mt-5 text-sm">
    <summary class="cursor-pointer text-accent">Boss locations</summary>
    <ul class="mt-3 grid gap-3 sm:grid-cols-2">
      {#each world.landmarks.filter((entry) => entry.kind === 'boss') as boss, index (boss.id)}
        <li>
          <button
            class="text-accent underline"
            aria-label={`Show ${boss.name} location ${index + 1}`}
            onclick={() => selectPlace(boss.id)}
            disabled={!ready}>{boss.name} ↗</button
          >
          <p class="mt-1 text-xs text-ink-muted">
            Fixed spawn · game X {Math.round(boss.position.x)}, Y {Math.round(boss.position.y)}
          </p>
        </li>
      {/each}
    </ul>
  </details>
  {#if unknown.length}<details class="mt-5 text-sm">
      <summary class="cursor-pointer text-accent"
        >{unknown.length} discoveries without map coordinates</summary
      >
      <ul class="mt-2 space-y-2">
        {#each unknown as entry (entry.id)}<li class="break-all">
            {entry.id} · {entry.characters} saved characters
          </li>{/each}
      </ul>
    </details>{/if}
</section>

<style>
  .atlas-grid {
    display: grid;
    grid-template-columns: minmax(0, 38rem) minmax(16rem, 1fr);
  }
  .map-window {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    touch-action: none;
    cursor: grab;
    background: #172820;
  }
  .map-window:active {
    cursor: grabbing;
  }
  .map-window:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: -3px;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  text {
    fill: #efe8d4;
    stroke: #1a261f;
    paint-order: stroke;
    font-family: var(--font-display);
    pointer-events: none;
  }
  text.selected {
    fill: #fff2bf;
    font-weight: 600;
  }
  text.player-name {
    fill: #ffffff;
    stroke-width: 3;
    font-family: var(--font-sans, inherit);
    font-weight: 700;
  }
  .map-corner,
  .map-scale {
    position: absolute;
    bottom: 0.8rem;
    border: 1px solid #65735b;
    border-radius: 0.3rem;
    padding: 0.2rem 0.45rem;
    background: #172820dd;
    color: #d5ddc4;
    font-size: 0.65rem;
    pointer-events: none;
  }
  .map-corner {
    left: 0.8rem;
  }
  .map-scale {
    right: 0.8rem;
  }
  .atlas-notes {
    border-left: 1px solid var(--color-line);
    background: var(--color-surface);
  }
  input[type='checkbox'] {
    accent-color: var(--color-gold);
    width: 1rem;
    height: 1rem;
  }
  @media (max-width: 760px) {
    .atlas-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .atlas-notes {
      border-left: 0;
      border-top: 1px solid var(--color-line);
    }
  }
</style>
