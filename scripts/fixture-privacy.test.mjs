import assert from 'node:assert/strict';
import test from 'node:test';
import { privacyProblems } from './fixture-privacy.mjs';

const id = 'C29B965F4A6FE5855746CDB2FB61F658';
const discoveries = [{ id, characters: 2 }];

test('only a canonical POI id at the world discovery path is public', () => {
  assert.deepEqual(privacyProblems('world.json', { save: { discoveries } }), []);
  for (const document of [
    { save: { discoveries }, name: id },
    { save: { discoveries: [{ id, character_guid: id }] } },
    { discoveries },
    { save: { discoveries: { example: { id } } } }
  ])
    assert.notEqual(privacyProblems('world.json', document).length, 0);
  assert.notEqual(privacyProblems('stream.json', { save: { discoveries } }).length, 0);
});

test('POI ids still reject private values and accept unknown game ids', () => {
  for (const privateId of ['192.0.2.1', 'WXYZ-1234', '?p=secret', id.toLowerCase()]) {
    assert.notEqual(
      privacyProblems('world.json', { save: { discoveries: [{ id: privateId }] } }).length,
      0
    );
  }
  assert.deepEqual(
    privacyProblems('world.json', {
      save: { discoveries: [{ id: 'UnknownPlace' }] },
      version: '1.0.0.6'
    }),
    []
  );
});
