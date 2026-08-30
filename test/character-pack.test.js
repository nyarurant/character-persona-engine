'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadCharacterPack } = require('../src');

test('loads a valid character pack', () => {
  const pack = loadCharacterPack(path.join(__dirname, '..', 'characters'), 'sample-character');
  assert.equal(pack.id, 'sample-character');
  assert.equal(pack.definition.displayName, 'Sample Character');
  assert.equal(pack.examples.length, 3);
  assert.equal(pack.lore.length, 1);
});

test('rejects path traversal as a character id', () => {
  assert.throws(() => loadCharacterPack(path.join(__dirname, '..', 'characters'), '../x'), /invalid character id/);
});
