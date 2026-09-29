import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageDir = join(root, 'mod', 'MagpieEvents');
const script = join(packageDir, 'Scripts', 'main.lua');
const globals = new Set([
  'ExecuteInGameThread',
  'FindFirstOf',
  'LoopAsync',
  'RegisterHook',
  'StaticFindObject',
  'io',
  'ipairs',
  'math',
  'os',
  'pairs',
  'pcall',
  'print',
  'require',
  'select',
  'string',
  'table',
  'tonumber',
  'tostring',
  'type'
]);
const required = ['ModName', 'PackageName', 'Author', 'Description', 'Dependencies'];

function fail(message) {
  console.error(`mod: ${message}`);
  process.exit(1);
}

function readInfo() {
  const info = JSON.parse(readFileSync(join(packageDir, 'Info.json'), 'utf8'));
  for (const key of required) {
    if (!(key in info)) fail(`Info.json has no ${key}`);
  }
  if ('Version' in info) {
    fail('Info.json must not carry a Version; packaging stamps it from package.json');
  }
  if (info.PackageName !== 'MagpieEvents') fail('the package name must stay MagpieEvents');
  return info;
}

async function check() {
  readInfo();
  const { default: luaparse } = await import('luaparse');
  const source = readFileSync(script, 'utf8');
  const ast = luaparse.parse(source, { luaVersion: '5.3', scope: true });
  const unknown = ast.globals.map((node) => node.name).filter((name) => !globals.has(name));
  if (unknown.length > 0)
    fail(`main.lua uses unknown globals: ${[...new Set(unknown)].join(', ')}`);
  const emitted = [...source.matchAll(/emit\("([^"]*)"/g)].map((match) => match[1]);
  const hooked = [...source.matchAll(/^hook\("[^"]+", "([^"]*)"/gm)].map((match) => match[1]);
  const kinds = new Set([...emitted, ...hooked]);
  if (kinds.size === 0) fail('main.lua emits nothing');
  for (const kind of kinds) {
    if (!/^[a-z][a-z_]*$/.test(kind)) fail(`event kind ${kind} is not lower snake case`);
  }
  const readme = readFileSync(join(root, 'mod', 'README.md'), 'utf8');
  const missing = [...kinds].filter((kind) => !readme.includes(`\`${kind}\``));
  if (missing.length > 0) fail(`mod/README.md does not list ${missing.join(', ')}`);
  console.log(`mod: Info.json, main.lua and README check out (${kinds.size} event kinds)`);
}

function stage(out) {
  const info = readInfo();
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const target = join(resolve(out), 'MagpieEvents');
  if (existsSync(target)) rmSync(target, { recursive: true });
  mkdirSync(target, { recursive: true });
  cpSync(join(packageDir, 'Scripts'), join(target, 'Scripts'), { recursive: true });
  cpSync(join(packageDir, 'enabled.txt'), join(target, 'enabled.txt'));
  cpSync(join(root, 'mod', 'README.md'), join(target, 'README.md'));
  cpSync(join(root, 'LICENSE'), join(target, 'LICENSE'));
  writeFileSync(
    join(target, 'Info.json'),
    `${JSON.stringify({ ...info, Version: version }, null, 2)}\n`
  );
  console.log(`mod: staged MagpieEvents ${version} in ${target}`);
}

const { values } = parseArgs({ options: { out: { type: 'string' } }, strict: true });
if (values.out) stage(values.out);
else await check();
