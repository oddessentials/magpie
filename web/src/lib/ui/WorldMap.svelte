<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import type { components } from '$lib/api/types';
  import {
    boundsOf,
    contains,
    clampView,
    labelPoint,
    mapCharts,
    mapSize,
    project,
    zoom,
    type MapData,
    type Point,
    type View
  } from './map';
  import Freshness from './Freshness.svelte';
  import { formatNumber } from './format';

  let { world, save }: { world: MapData; save: components['schemas']['WorldSave'] | null } =
    $props();
  let ready = $state(false);
  let chartId = $state('main');
  let selected = $state<number | null>(null);
  let selectedPlace = $state<string | null>(null);
  let view = $state<View>({ x: 0, y: 0, size: mapSize });
  let showLabels = $state(true);
  let showStones = $state(true);
  let showBosses = $state(true);
  let width = $state(640);
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
        bounds: boundsOf(points)
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

  onMount(() => {
    ready = true;
  });

  function reset() {
    view = { x: 0, y: 0, size: mapSize };
  }

  function changeChart() {
    selectedPlace = null;
    selected = null;
    reset();
  }

  function selectRegion(id: number) {
    selectedPlace = null;
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
    selectedPlace = id;
    selected = null;
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
    const marker = landmarks.find(
      (entry) =>
        ((entry.kind === 'boss' && showBosses) || (entry.kind === 'lodestone' && showStones)) &&
        Math.hypot(entry.at.x - point.x, entry.at.y - point.y) <= 14 * k
    );
    if (marker) {
      selectedPlace = marker.id;
      selected = null;
      return;
    }
    selectedPlace = null;
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
          {#each regions as entry (entry.id)}
            <polygon
              points={entry.points}
              fill={groupColors[entry.group] ?? '#4c665a'}
              fill-opacity={selected === entry.id ? 0.95 : 0.65}
              stroke={selected === entry.id ? '#f7df9e' : '#b4bd97'}
              stroke-opacity={selected === entry.id ? 1 : 0.45}
              stroke-width={(selected === entry.id ? 2.5 : 0.8) * k}
            />
            <polygon points={entry.points} fill="url(#atlas-grain)" />
          {/each}
          {#if showLabels}
            {#each regions as entry (entry.id)}
              {#if entry.id === selected || ((entry.bounds.max.x - entry.bounds.min.x) / k > 90 && (entry.bounds.max.y - entry.bounds.min.y) / k > 45)}
                <text
                  x={Math.min(
                    mapSize - entry.name.length * 4 * k,
                    Math.max(entry.name.length * 4 * k, entry.label.x)
                  )}
                  y={entry.label.y}
                  text-anchor="middle"
                  dominant-baseline="middle"
                  font-size={14 * k}
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
        <p class="eyebrow">
          {place ? 'Fixed landmark' : region ? 'Selected region' : 'Beyond the familiar'}
        </p>
        <h2 class="mt-2 font-display text-2xl text-ink">
          {place?.name ?? region?.name ?? 'The wilds, charted'}
        </h2>
        <p class="mt-2 text-sm text-ink-muted">
          {place
            ? place.kind === 'boss'
              ? 'A fixed spawn location from the game build.'
              : 'A fixed lodestone from the game build.'
            : region
              ? `Region ${region.id}${region.power_level === null ? '' : ` · Power level ${region.power_level}`}`
              : `${world.regions.length} regions. ${world.landmarks.filter((entry) => entry.kind === 'lodestone').length} fixed lodestones. A world worth returning to.`}
        </p>
        {#if region}<button
            class="btn mt-3"
            onclick={() => selectRegion(region.id)}
            disabled={!ready}>Focus region</button
          >{/if}
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
      </fieldset>
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
        boundaries and fixed locations are game facts. Coordinates use game X and Y; boundaries may
        overlap.
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
