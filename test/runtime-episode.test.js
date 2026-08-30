'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CharacterEngine } = require('../src/runtime/character-engine');
const { RuntimeContext } = require('../src/runtime/runtime-context');

test('runtime injects past episodes into generation prompt', async () => {
  let captured;
  const pack = {
    id: 'x',
    definition: { displayName: 'X', identity: { selfDescription: 'demo' }, generation: {} },
    persona: '',
    rules: '',
    examples: [],
    lore: [],
  };
  const runtimeContext = new RuntimeContext({
    episodeStore: { retrieve() { return [{ summary: '一緒にボスを倒した' }]; } },
  });
  const engine = new CharacterEngine({
    pack,
    runtimeContext,
    voiceRetriever: async () => [],
    loreRetriever: async () => [],
    provider: {
      async generate(input) {
        captured = input;
        return { text: 'ok' };
      },
    },
  });
  const result = await engine.respond({ message: 'あのボス覚えてる？', speaker: { id: 'u1', name: 'A' } });
  assert.equal(result.text, 'ok');
  assert.match(captured.systemPrompt, /一緒にボスを倒した/);
  assert.equal(result.runtime.episodes.length, 1);
});
