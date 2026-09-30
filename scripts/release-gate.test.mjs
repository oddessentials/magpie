import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { publicationAllowed } from './release-gate.mjs';

const env = {
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF_TYPE: 'tag',
  GITHUB_REF_NAME: 'v0.2.0',
  GITHUB_REPOSITORY: 'oddessentials/magpie',
  GITHUB_TOKEN: 'test'
};
const responses = (statuses) => async () => {
  assert.ok(statuses.length, 'unexpected network request');
  const status = statuses.shift();
  return { status, ok: status === 200, json: async () => ({ token: 'registry-test' }) };
};

test('only a matching tag push may publish an unused version', async () => {
  const statuses = [404, 200, 404, 200, 404];
  assert.equal(await publicationAllowed(env, '0.2.0', responses(statuses)), true);
  assert.equal(statuses.length, 0);
  for (const override of [
    { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_EVENT_NAME: 'workflow_dispatch' }
  ]) {
    assert.equal(await publicationAllowed({ ...env, ...override }, '0.2.0', responses([])), false);
  }
  await assert.rejects(publicationAllowed(env, '0.1.0', responses([])), /match/);
});

test('existing releases, either published image and uncertain checks refuse publication', async () => {
  for (const statuses of [
    [200],
    [403],
    [500],
    [404, 401],
    [404, 200, 200],
    [404, 200, 403],
    [404, 200, 404, 200, 200]
  ]) {
    await assert.rejects(publicationAllowed(env, '0.2.0', responses(statuses)));
  }
  await assert.rejects(
    publicationAllowed(env, '0.2.0', async () => {
      throw new Error('offline');
    }),
    /offline/
  );
});

test('merges cannot trigger publication, and site changes on main deploy Pages', () => {
  const release = parse(
    readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
  );
  const pages = parse(
    readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8')
  );
  assert.deepEqual(release.on.push, { tags: ['v*'] });
  assert.ok('pull_request' in release.on && 'workflow_dispatch' in release.on);
  assert.deepEqual(pages.on.push, {
    branches: ['main'],
    paths: ['site/**', '.github/workflows/pages.yml']
  });
  assert.deepEqual(Object.keys(pages.on), ['push', 'workflow_dispatch']);
  assert.equal(release.jobs.version.steps.at(-1).run, 'node scripts/release-gate.mjs');
  assert.ok(release.jobs.release.steps.at(-1).run.includes('--verify-tag'));
  assert.ok(!release.jobs.release.steps.at(-1).run.includes('--target'));
});
