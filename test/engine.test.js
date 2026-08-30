'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { CharacterEngine, loadCharacterPack } = require('../src');

test('engine composes character context and delegates generation', async () => {
  const pack = loadCharacterPack(path.join(__dirname, '..', 'characters'), 'sample-character');
  let captured;
  const engine = new CharacterEngine({
    pack,
    provider: {
      async generate(input) {
        captured = input;
        return { text: '  ok  ', usage: { output_tokens: 1 } };
      },
    },
  });

  const result = await engine.respond({
    message: '眠い',
    speaker: { id: 'u1', name: 'A' },
    relationshipNote: 'old friend',
    memories: [{ fact: 'coffee is preferred' }],
    episodes: [{ summary: 'laughed together about a strange late-night bug' }],
    temporaryState: { topic: 'late night' },
    history: [{ authorId: 'u2', authorName: 'B', content: 'まだ起きてる？' }],
  });

  assert.equal(result.text, 'ok');
  assert.match(captured.systemPrompt, /Sample Character/);
  assert.match(captured.systemPrompt, /Voice reference/);
  assert.match(captured.systemPrompt, /Relationship with current speaker/);
  assert.match(captured.systemPrompt, /Relevant past episodes/);
  assert.match(captured.systemPrompt, /strange late-night bug/);
  assert.match(captured.userPrompt, /まだ起きてる/);
  assert.match(captured.userPrompt, /B/);
  assert.match(captured.userPrompt, /眠い/);
});

test('engine can resolve runtime context automatically', async () => {
  const pack = loadCharacterPack(path.join(__dirname, '..', 'characters'), 'sample-character');
  let systemPrompt;
  const engine = new CharacterEngine({
    pack,
    runtimeContext: {
      resolve({ speakerId, scopeId }) {
        assert.equal(speakerId, 'u2');
        assert.equal(scopeId, 'channel-1');
        return {
          memories: [{ fact: 'likes tea' }],
          episodes: [{ summary: 'once compared three teas together' }],
          relationshipNote: 'close friend',
          relationshipSource: 'profile',
          temporaryState: { topic: 'tea' },
          affinity: { score: 30, tier: 'close' },
        };
      },
    },
    provider: { async generate(input) { systemPrompt = input.systemPrompt; return { text: 'ok' }; } },
  });
  const result = await engine.respond({
    message: 'お茶いる？',
    speaker: { id: 'u2', name: 'B' },
    scopeId: 'channel-1',
  });
  assert.match(systemPrompt, /likes tea/);
  assert.match(systemPrompt, /compared three teas/);
  assert.match(systemPrompt, /close friend/);
  assert.equal(result.runtime.affinity.tier, 'close');
  assert.equal(result.runtime.episodes.length, 1);
  assert.equal(result.runtime.relationshipSource, 'profile');
});
