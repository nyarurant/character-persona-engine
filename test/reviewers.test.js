'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMemoryDecision,
  parseConversationReview,
  ReviewedCharacterEngine,
} = require('../src');

test('memory reviewer rejects sensitive-looking durable facts', () => {
  const credential = parseMemoryDecision('{"action":"remember","category":"identity","fact":"password abc","confidence":1,"expiresInDays":null}');
  const health = parseMemoryDecision('{"action":"remember","category":"identity","fact":"持病の診断がある","confidence":1,"expiresInDays":null}');
  assert.equal(credential.ok, false);
  assert.equal(health.ok, false);
});

test('ongoing memory requires an expiry', () => {
  assert.equal(parseMemoryDecision('{"action":"remember","category":"ongoing","fact":"finish project","confidence":0.9,"expiresInDays":null}').ok, false);
  assert.equal(parseMemoryDecision('{"action":"remember","category":"ongoing","fact":"finish project","confidence":0.9,"expiresInDays":7}').ok, true);
});

test('conversation review parses repair affinity and episodic selection', () => {
  const result = parseConversationReview('{"state":{"topic":"x","unresolved":[],"participants":[],"tone":"playful","runningBit":null,"expiresInMinutes":20},"repair":{"action":"EDIT","replacement":"修正","reason":"wrong referent"},"affinityDelta":1,"episode":{"store":true,"summary":"変なバグで一緒に笑った","expiresInDays":30}}');
  assert.equal(result.ok, true);
  assert.equal(result.value.repair.replacement, '修正');
  assert.equal(result.value.affinityDelta, 1);
  assert.equal(result.value.episode.store, true);
  assert.equal(result.value.episode.summary, '変なバグで一緒に笑った');
  assert.equal(result.value.episode.expiresInDays, 30);
});

test('conversation review defaults missing episode to not stored', () => {
  const result = parseConversationReview('{"state":{"topic":null,"unresolved":[],"participants":[],"tone":"neutral","runningBit":null,"expiresInMinutes":30},"repair":{"action":"KEEP","replacement":null,"reason":""},"affinityDelta":0}');
  assert.equal(result.ok, true);
  assert.equal(result.value.episode.store, false);
});

test('ReviewedCharacterEngine applies repair state affinity and selected episode', async () => {
  const engine = { provider: {}, async respond() { return { text: 'wrong' }; } };
  const conversationStateStore = {
    get() { return null; },
    set(scopeId, state) { this.scopeId = scopeId; this.state = state; },
  };
  const affinityStore = {
    adjust(subjectId, delta) { this.subjectId = subjectId; this.delta = delta; return { score: 1, tier: 'neutral' }; },
  };
  const episodicStore = {
    add(input) { this.input = input; return { id: 'episode-1', ...input }; },
  };
  const conversationProvider = {
    async generate() {
      return { text: '{"state":{"topic":"x","unresolved":[],"participants":[],"tone":"neutral","runningBit":null,"expiresInMinutes":30},"repair":{"action":"EDIT","replacement":"fixed","reason":"wrong referent"},"affinityDelta":1,"episode":{"store":true,"summary":"shared joke","expiresInDays":20}}' };
    },
  };
  const reviewed = new ReviewedCharacterEngine({
    engine,
    episodicStore,
    conversationStateStore,
    affinityStore,
    conversationProvider,
    memoryReview: false,
  });
  const result = await reviewed.respond({
    message: 'x',
    messageId: 'm1',
    speaker: { id: 'u1', name: 'User' },
    scopeId: 'c1',
  });
  assert.equal(result.text, 'fixed');
  assert.equal(conversationStateStore.state.topic, 'x');
  assert.equal(affinityStore.subjectId, 'u1');
  assert.equal(affinityStore.delta, 1);
  assert.equal(episodicStore.input.summary, 'shared joke');
  assert.equal(episodicStore.input.sourceMessageId, 'm1');
});
