import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const recorded = JSON.parse(
  readFileSync(new URL('../tools/rig/build.json', import.meta.url), 'utf8')
);

async function publicBuild(app) {
  const response = await fetch(`https://api.steamcmd.net/v1/info/${app}`);
  if (!response.ok) throw new Error(`api.steamcmd.net answered ${response.status} for app ${app}`);
  const document = await response.json();
  const branch = document?.data?.[app]?.depots?.branches?.public;
  const build = Number(branch?.buildid);
  if (!Number.isInteger(build) || build <= 0) throw new Error(`no public build id for app ${app}`);
  return { build, updated: new Date(Number(branch.timeupdated) * 1000).toISOString().slice(0, 10) };
}

const apps = [
  { label: 'dedicated server', app: recorded.server_app, recorded: recorded.server_build },
  { label: 'client', app: recorded.client_app, recorded: recorded.client_build }
];
const changed = [];
for (const entry of apps) {
  const current = await publicBuild(entry.app);
  if (current.build === entry.recorded) {
    console.log(
      `dragonwilds build: the ${entry.label} facts match the public build ${current.build}`
    );
  } else {
    console.log(
      `dragonwilds build: the ${entry.label} public build is ${current.build} (${current.updated}); the facts come from ${entry.recorded} (${recorded.version})`
    );
    changed.push({ ...entry, ...current });
  }
}
if (changed.length === 0 || !process.argv.includes('--issue')) process.exit(0);

const title = `Dragonwilds ${changed.map((entry) => `${entry.label} build ${entry.build}`).join(' and ')} out`;
const open = execFileSync(
  'gh',
  ['issue', 'list', '--state', 'open', '--search', `"${title}" in:title`, '--json', 'number'],
  { encoding: 'utf8' }
);
if (JSON.parse(open).length > 0) {
  console.log('dragonwilds build: an open issue already tracks it');
  process.exit(0);
}
const body = [
  ...changed.map(
    (entry) =>
      `The ${entry.label}'s public build on Steam (app ${entry.app}) is now ${entry.build}, updated ${entry.updated}. Magpie's facts come from build ${entry.recorded}, version ${recorded.version}.`
  ),
  '',
  '- [ ] Update the rig with SteamCMD, run `tools/rig/run_server.py` once, and diff the generated `DedicatedServer.ini`, the startup log and the log templates against the previous session.',
  '- [ ] Run `tools/rig/spud_peek.py` on a fresh world save and a player save; note any new chunk or header field.',
  '- [ ] Run `tools/rig/iostore_peek.py` and check the package flags and container layout.',
  '- [ ] Record the new builds in `tools/rig/build.json` and note what changed.'
].join('\n');
execFileSync('gh', ['issue', 'create', '--title', title, '--body', body], { stdio: 'inherit' });
