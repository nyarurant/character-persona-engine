'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HybridRetriever, OllamaEmbedder } = require('../src');
const { exampleSearchText } = require('../src/retrieval/lexical');

test('hybrid retriever combines semantic and lexical scores', async () => {
  const items = [{ id: 'sleepy', content: '眠い' }, { id: 'awake', content: '元気' }];
  const vectors = { '眠い': [1, 0], '元気': [0, 1], 'ねむい': [1, 0] };
  const embedder = { async embed(texts) { return texts.map((text) => vectors[String(text).trim()] || [0, 0]); } };
  const retriever = new HybridRetriever({ embedder, textFn: exampleSearchText });
  const result = await retriever.retrieve(items, 'ねむい', 1);
  assert.equal(result[0].id, 'sleepy');
  assert.ok(result[0]._semanticScore > 0.9);
});

test('hybrid retriever falls back to lexical when embeddings fail', async () => {
  const retriever = new HybridRetriever({
    embedder: { async embed() { throw new Error('embedding service unavailable'); } },
    textFn: exampleSearchText,
  });
  const result = await retriever.retrieve([{ id: 'sleepy', content: '眠い' }], '眠い', 1);
  assert.equal(result[0].id, 'sleepy');
});

test('Ollama embedder accepts the /api/embed response shape', async () => {
  const embedder = new OllamaEmbedder({
    fetchImpl: async () => ({ ok: true, json: async () => ({ embeddings: [[1, 2, 3]] }) }),
  });
  assert.deepEqual(await embedder.embed(['hello']), [[1, 2, 3]]);
});
