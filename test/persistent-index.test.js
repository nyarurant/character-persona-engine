'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { PersistentEmbeddingIndex } = require('../src');
class FakeEmbedder { constructor() { this.model = 'fake'; } async embed(texts) { return texts.map((text) => [String(text).includes('猫') ? 1 : 0, String(text).includes('犬') ? 1 : 0, Math.min(String(text).length, 10) / 10]); } }
test('persistent index embeds only changed records and survives reload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-')); const file = path.join(dir, 'index.json'); const items = [{ id: 'a', content: '猫が好き' }, { id: 'b', content: '犬が好き' }];
  const index = new PersistentEmbeddingIndex({ filePath: file, embedder: new FakeEmbedder() });
  assert.equal((await index.sync(items, { domain: 'voice', textFn: (x) => x.content })).embedded, 2);
  assert.equal((await index.sync(items, { domain: 'voice', textFn: (x) => x.content })).embedded, 0);
  items[0].content = '猫が大好き';
  assert.equal((await index.sync(items, { domain: 'voice', textFn: (x) => x.content })).embedded, 1);
  const reloaded = new PersistentEmbeddingIndex({ filePath: file, embedder: new FakeEmbedder() });
  assert.equal((await reloaded.sync(items, { domain: 'voice', textFn: (x) => x.content })).embedded, 0);
  assert.equal((await reloaded.retrieve(items, '猫', 1, { domain: 'voice', textFn: (x) => x.content }))[0].id, 'a');
});
