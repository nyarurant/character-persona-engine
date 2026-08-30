'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PersistentEmbeddingCache } = require('../src');

test('persistent embedding cache embeds only missing or changed texts across restarts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-embed-cache-'));
  const filePath = path.join(dir, 'embeddings.json');
  const calls = [];
  const embedder = {
    cacheKey: 'fake:model-v1',
    async embed(texts) {
      calls.push([...texts]);
      return texts.map((text) => [String(text).length, 1]);
    },
  };

  const first = new PersistentEmbeddingCache({ filePath });
  assert.deepEqual(await first.embedTexts(['alpha', 'beta'], embedder, 'pack:voice'), [[5, 1], [4, 1]]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);

  const afterRestart = new PersistentEmbeddingCache({ filePath });
  assert.deepEqual(await afterRestart.embedTexts(['alpha', 'beta'], embedder, 'pack:voice'), [[5, 1], [4, 1]]);
  assert.equal(calls.length, 1);

  await afterRestart.embedTexts(['alpha', 'gamma'], embedder, 'pack:voice');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], ['gamma']);
  assert.equal(Object.values(afterRestart.entries).filter((entry) => entry.namespace === 'pack:voice').length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('embedding cache keeps Voice and Lore namespaces independent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-embed-cache-'));
  const cache = new PersistentEmbeddingCache({ filePath: path.join(dir, 'embeddings.json') });
  const embedder = { cacheKey: 'fake', async embed(texts) { return texts.map(() => [1, 0]); } };
  await cache.embedTexts(['same text'], embedder, 'pack:voice');
  await cache.embedTexts(['same text'], embedder, 'pack:lore');
  assert.equal(Object.keys(cache.entries).length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
