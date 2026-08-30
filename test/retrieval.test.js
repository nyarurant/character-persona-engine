'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { retrieveVoice, retrieveLore } = require('../src');

test('voice and lore retrieval remain separate', () => {
  const voice = retrieveVoice([{ id: 'v', content: '眠いな' }], '眠い', 3);
  const lore = retrieveLore([{ id: 'l', fact: '猫が好き' }], '眠い', 3);
  assert.equal(voice[0].id, 'v');
  assert.equal(lore.length, 0);
});
