import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function publicBuild(app, request = fetch) {
  const response = await request(`https://api.steamcmd.net/v1/info/${app}`);
  if (!response.ok) throw new Error(`api.steamcmd.net answered ${response.status} for app ${app}`);
  const document = await response.json();
  const branch = document?.data?.[app]?.depots?.branches?.public;
  const build = Number(branch?.buildid);
  const updated = new Date(Number(branch?.timeupdated) * 1000);
  if (!Number.isSafeInteger(build) || build <= 0 || !Number.isFinite(updated.getTime())) {
    throw new Error(`invalid public build for app ${app}`);
  }
  return { build, updated: updated.toISOString().slice(0, 10) };
}

export async function checkBuilds(
  recorded,
  { issue = false, request = fetch, run = execFileSync, log = console.log } = {}
) {
  const apps = [
    { label: 'dedicated server', app: recorded.server_app, recorded: recorded.server_build },
    { label: 'client', app: recorded.client_app, recorded: recorded.client_build }
  ];
  const changed = [];
  for (const entry of apps) {
    if (!Number.isSafeInteger(entry.app) || entry.app <= 0) throw new Error('invalid recorded app');
    const current = await publicBuild(entry.app, request);
    if (current.build === entry.recorded) {
      log(`dragonwilds build: the ${entry.label} facts match the public build ${current.build}`);
    } else {
      log(
        `dragonwilds build: the ${entry.label} public build is ${current.build} (${current.updated}); the facts come from ${entry.recorded} (${recorded.version})`
      );
      changed.push({ ...entry, ...current });
    }
  }
  if (changed.length === 0) return 0;
  if (!issue) return 1;

  const title = `Dragonwilds ${changed.map((entry) => `${entry.label} build ${entry.build}`).join(' and ')} out`;
  const open = run(
    'gh',
    ['issue', 'list', '--state', 'open', '--search', `"${title}" in:title`, '--json', 'number'],
    { encoding: 'utf8' }
  );
  if (JSON.parse(open).length > 0) {
    log('dragonwilds build: an open issue already tracks it');
    return 0;
  }
  const body = [
    ...changed.map(
      (entry) =>
        `The ${entry.label}'s public build on Steam (app ${entry.app}) is now ${entry.build}, updated ${entry.updated}. Magpie's facts come from build ${entry.recorded}, version ${recorded.version}.`
    ),
    '',
    '- [ ] Preserve the previous evidence, update the dedicated-server rig, and compare startup, generated configuration and log templates.',
    '- [ ] Inspect complete world saves, including embedded CachedCharacterStates, buildings, progress and POI custom data.',
    '- [ ] Dump mappings from the installed build, re-extract facts with both installs, and review all build stamps and data changes.',
    '- [ ] Verify hook registration and safe serialization/capture paths without calling hooked RPCs on class default objects.',
    '- [ ] Run the automated regressions and npm run verify; stop the server through the verified save-and-quit path.'
  ].join('\n');
  run('gh', ['issue', 'create', '--title', title, '--body', body], { stdio: 'inherit' });
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const recorded = JSON.parse(
    readFileSync(new URL('../web/src/lib/world/build.json', import.meta.url), 'utf8')
  );
  process.exitCode = await checkBuilds(recorded, { issue: process.argv.includes('--issue') });
}
