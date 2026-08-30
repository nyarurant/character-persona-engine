'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildPersonaFromCorpus } = require('../src/build/persona-builder');
const { readCorpusJsonl, computeCorpusStats } = require('../src/build/corpus');

test('corpus reader filters low-signal lines and computes stats', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-corpus-'));
  const file = path.join(dir, 'data.jsonl');
  fs.writeFileSync(file, [
    JSON.stringify({ id: '1', content: '眠い' }),
    JSON.stringify({ id: '2', content: 'www' }),
    JSON.stringify({ id: '3', content: 'それはある', repliedTo: { authorName: 'A', content: 'だよね' } }),
  ].join('\n'));
  const corpus = readCorpusJsonl(file);
  assert.equal(corpus.length, 2);
  assert.equal(computeCorpusStats(corpus).replies, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('persona builder writes examples and persona through provider interface', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-build-'));
  const characterDir = path.join(dir, 'character');
  const corpusFile = path.join(dir, 'corpus.jsonl');
  fs.writeFileSync(corpusFile, [
    JSON.stringify({ id: '1', content: '眠いな' }),
    JSON.stringify({ id: '2', content: 'それはある' }),
    JSON.stringify({ id: '3', content: '知らんけど' }),
  ].join('\n'));
  let called = false;
  const result = await buildPersonaFromCorpus({
    characterDir,
    corpusPath: corpusFile,
    provider: { async generate({ systemPrompt, userPrompt }) {
      called = true;
      assert.match(systemPrompt, /evidence-grounded/);
      assert.match(userPrompt, /Corpus statistics/);
      return { text: '# Persona\nShort and dry.' };
    } },
  });
  assert.equal(called, true);
  assert.equal(result.examples, 3);
  assert.match(fs.readFileSync(path.join(characterDir, 'persona.md'), 'utf8'), /Short and dry/);
  fs.rmSync(dir, { recursive: true, force: true });
});
