'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RuntimeContext } = require('../src');

test('manual user profile overrides affinity-derived relationship note', () => {
  const runtime = new RuntimeContext({
    userProfiles: { u1: { relationshipNote: 'hand-written friend profile' } },
    affinityStore: { get() { return { tier: 'close', score: 99 }; } },
    affinityNotes: { close: 'automatic close note' },
  });
  const resolved = runtime.resolve({ speakerId: 'u1', query: 'x' });
  assert.equal(resolved.relationshipNote, 'hand-written friend profile');
  assert.deepEqual(resolved.userProfile, { relationshipNote: 'hand-written friend profile' });
});

test('affinity note remains fallback when no manual profile exists', () => {
  const runtime = new RuntimeContext({ affinityStore: { get() { return { tier: 'close' }; } }, affinityNotes: { close: 'fallback' } });
  assert.equal(runtime.resolve({ speakerId: 'u2' }).relationshipNote, 'fallback');
});
