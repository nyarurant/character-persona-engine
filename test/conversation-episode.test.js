'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { parseConversationReview } = require('../src');
test('conversation reviewer parses an optional shared episode', () => {
  const parsed = parseConversationReview(JSON.stringify({ state: { topic: 'game', unresolved: [], participants: [], tone: 'playful', runningBit: null, expiresInMinutes: 30 }, repair: { action: 'KEEP', replacement: null, reason: '' }, affinityDelta: 1, episode: { action: 'SAVE', summary: '一緒にボスを倒した', tags: ['game'], expiresInDays: 90 } }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.episode.action, 'SAVE');
  assert.equal(parsed.value.episode.expiresInDays, 90);
});
