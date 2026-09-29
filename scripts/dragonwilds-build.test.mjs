import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBuilds, publicBuild } from './dragonwilds-build.mjs';

const recorded = {
  server_app: 1,
  server_build: 10,
  client_app: 2,
  client_build: 20,
  version: '1.0'
};
const request = (builds) => async (url) => {
  const app = url.split('/').at(-1);
  return {
    ok: true,
    json: async () => ({
      data: {
        [app]: {
          depots: { branches: { public: { buildid: builds[app], timeupdated: 1790000000 } } }
        }
      }
    })
  };
};
const log = () => {};

test('build validation fails on either stale build and on absent client provenance', async () => {
  assert.equal(await checkBuilds(recorded, { request: request({ 1: 10, 2: 20 }), log }), 0);
  for (const builds of [
    { 1: 11, 2: 20 },
    { 1: 10, 2: 21 }
  ]) {
    assert.equal(await checkBuilds(recorded, { request: request(builds), log }), 1);
  }
  assert.equal(
    await checkBuilds(
      { ...recorded, client_build: null },
      { request: request({ 1: 10, 2: 20 }), log }
    ),
    1
  );
});

test('issue mode creates one maintenance issue and does not duplicate an existing issue', async () => {
  for (const existing of [false, true]) {
    const calls = [];
    const run = (command, args) => {
      calls.push([command, args]);
      return existing ? '[{"number":39}]' : '[]';
    };
    assert.equal(
      await checkBuilds(recorded, { issue: true, request: request({ 1: 11, 2: 21 }), run, log }),
      0
    );
    assert.equal(calls.length, existing ? 1 : 2);
    if (!existing) {
      const args = calls[1][1];
      assert.match(args[args.indexOf('--body') + 1], /embedded CachedCharacterStates/);
    }
  }
});

test('network and malformed responses fail instead of claiming freshness', async () => {
  await assert.rejects(
    publicBuild(1, async () => ({ ok: false, status: 503 })),
    /503/
  );
  await assert.rejects(publicBuild(1, request({ 1: 'invalid' })), /invalid public build/);
  await assert.rejects(
    publicBuild(1, async () => ({ ok: true, json: async () => ({}) })),
    /invalid public build/
  );
  await assert.rejects(
    checkBuilds(recorded, {
      request: async () => {
        throw new Error('offline');
      },
      log
    }),
    /offline/
  );
});
