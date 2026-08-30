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
    temporaryState: { topic: 'late night' },
  });

  assert.equal(result.text, 'ok');
  assert.match(captured.systemPrompt, /Sample Character/);
  assert.match(captured.systemPrompt, /Voice reference/);
  assert.match(captured.systemPrompt, /Relationship with current speaker/);
  assert.match(captured.userPrompt, /眠い/);
});
