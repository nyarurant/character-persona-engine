'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMemoryDecision,
  parseConversationReview,
  ReviewedCharacterEngine,
} = require('../src');

test('memory reviewer rejects sensitive-looking durable facts', () => {
  const result = parseMemoryDecision('{"action":"remember","category":"identity","fact":"password abc","confidence":1,"expiresInDays":null}');
  assert.equal(result.ok, false);
});

test('ongoing memory requires an expiry', () => {
  assert.equal(parseMemoryDecision('{"action":"remember","category":"ongoing","fact":"finish project","confidence":0.9,"expiresInDays":null}').ok, false);
  assert.equal(parseMemoryDecision('{"action":"remember","category":"ongoing","fact":"finish project","confidence":0.9,"expiresInDays":7}').ok, true);
});

test('conversation review parses repair and affinity delta', () => {
  const result = parseConversationReview('{"state":{"topic":"x","unresolved":[],"participants":[],"tone":"playful","runningBit":null,"expiresInMinutes":20},"repair":{"action":"EDIT","replacement":"修正","reason":"wrong referent"},"affinityDelta":1}');
  assert.equal(result.ok, true);
  assert.equal(result.value.repair.replacement, '修正');
  assert.equal(result.value.affinityDelta, 1);
});

test('ReviewedCharacterEngine applies repair, state, and affinity', async () => {
  const engine = { provider: {}, async respond() { return { text: 'wrong' }; } };
  const conversationStateStore = {
    get() { return null; },
    set(scopeId, state) { this.scopeId = scopeId; this.state = state; },
  };
  const affinityStore = {
    adjust(subjectId, delta) { this.subjectId = subjectId; this.delta = delta; return { score: 1, tier: 'neutral' }; },
  };
  const conversationProvider = {
    async generate() {
      return { text: '{"state":{"topic":"x","unresolved":[],"participants":[],"tone":"neutral","runningBit":null,"expiresInMinutes":30},"repair":{"action":"EDIT","replacement":"fixed","reason":"wrong referent"},"affinityDelta":1}' };
    },
  };
  const reviewed = new ReviewedCharacterEngine({
    engine,
    conversationStateStore,
    affinityStore,
    conversationProvider,
    memoryReview: false,
  });
  const result = await reviewed.respond({ message: 'x', speaker: { id: 'u1', name: 'User' }, scopeId: 'c1' });
  assert.equal(result.text, 'fixed');
  assert.equal(conversationStateStore.state.topic, 'x');
  assert.equal(affinityStore.subjectId, 'u1');
  assert.equal(affinityStore.delta, 1);
});
