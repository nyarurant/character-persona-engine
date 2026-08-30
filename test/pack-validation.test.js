'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExampleRecord, validateLoreRecord } = require('../src');

test('example validator rejects malformed contextual records', () => {
  assert.doesNotThrow(() => validateExampleRecord({ content: 'ok', context: [{ authorName: 'A', content: 'hi' }] }));
  assert.throws(() => validateExampleRecord({ content: '', parts: [] }), /content or parts/);
  assert.throws(() => validateExampleRecord({ content: 'ok', context: [{ content: '' }] }), /context/);
});

test('lore validator requires canonical content and valid tags', () => {
  assert.doesNotThrow(() => validateLoreRecord({ fact: 'X belongs to Y', tags: ['org'] }));
  assert.throws(() => validateLoreRecord({ title: 'empty' }), /fact or content/);
  assert.throws(() => validateLoreRecord({ fact: 'ok', tags: [''] }), /tags/);
});
