'use strict';

const crypto = require('node:crypto');
const { readJsonFile, writeJsonAtomic } = require('../state/atomic-json');
const { overlapScore, exampleSearchText, loreSearchText, rankLexical } = require('./lexical');

function fingerprint(text) { return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex'); }
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = Number(a[index]), y = Number(b[index]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y; aa += x * x; bb += y * y;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
function defaultId(item, index) { return String(item?.id ?? index); }

class PersistentEmbeddingIndex {
  constructor({ filePath, embedder, batchSize = 64, modelKey = null } = {}) {
    if (!filePath) throw new TypeError('filePath is required');
    if (!embedder || typeof embedder.embed !== 'function') throw new TypeError('embedder.embed is required');
    this.filePath = filePath; this.embedder = embedder; this.batchSize = Math.max(1, Number(batchSize) || 64);
    this.modelKey = String(modelKey || embedder.model || 'unknown');
    const parsed = readJsonFile(filePath, { version: 1, modelKey: this.modelKey, records: {} });
    this.records = parsed.modelKey === this.modelKey && parsed.records && typeof parsed.records === 'object' ? parsed.records : {};
  }
  save() { writeJsonAtomic(this.filePath, { version: 1, modelKey: this.modelKey, records: this.records }); }
  async sync(items, { domain = 'default', textFn = (item) => String(item?.content ?? ''), idFn = defaultId } = {}) {
    const list = items || [], expected = new Set(), pending = [];
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index], key = `${domain}:${idFn(item, index)}`, text = textFn(item), hash = fingerprint(text);
      expected.add(key); if (!this.records[key] || this.records[key].fingerprint !== hash) pending.push({ key, text, hash });
    }
    for (let offset = 0; offset < pending.length; offset += this.batchSize) {
      const batch = pending.slice(offset, offset + this.batchSize), vectors = await this.embedder.embed(batch.map((entry) => entry.text));
      if (!Array.isArray(vectors) || vectors.length !== batch.length) throw new Error('embedder returned invalid batch');
      for (let index = 0; index < batch.length; index += 1) {
        if (!Array.isArray(vectors[index]) || !vectors[index].length) throw new Error('embedder returned empty vector');
        this.records[batch[index].key] = { fingerprint: batch[index].hash, vector: vectors[index] };
      }
    }
    let removed = 0;
    for (const key of Object.keys(this.records)) if (key.startsWith(`${domain}:`) && !expected.has(key)) { delete this.records[key]; removed += 1; }
    if (pending.length || removed) this.save();
    return { embedded: pending.length, removed, total: list.length };
  }
  async retrieve(items, query, k = 6, { domain = 'default', textFn = (item) => String(item?.content ?? ''), idFn = defaultId, lexicalWeight = 0.35, semanticWeight = 0.65 } = {}) {
    const list = items || [];
    if (!list.length || !String(query || '').trim()) return [];
    await this.sync(list, { domain, textFn, idFn });
    const queryVector = (await this.embedder.embed([query]))?.[0];
    if (!Array.isArray(queryVector) || !queryVector.length) throw new Error('embedder returned invalid query vector');
    return list.map((item, index) => {
      const key = `${domain}:${idFn(item, index)}`, lexical = overlapScore(query, textFn(item)), semantic = Math.max(0, cosineSimilarity(queryVector, this.records[key]?.vector));
      return { item, index, lexical, semantic, score: lexicalWeight * lexical + semanticWeight * semantic };
    }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, Math.max(0, k)).map(({ item, score, lexical, semantic }) => ({ ...item, _score: Number(score.toFixed(4)), _lexicalScore: Number(lexical.toFixed(4)), _semanticScore: Number(semantic.toFixed(4)) }));
  }
}

function createIndexedRetriever({ index, domain, textFn, lexicalWeight = 0.35, semanticWeight = 0.65, fallbackOnError = true } = {}) {
  if (!index) throw new TypeError('index is required');
  return { async retrieve(items, query, k) {
    try { return await index.retrieve(items, query, k, { domain, textFn, lexicalWeight, semanticWeight }); }
    catch (error) { if (!fallbackOnError) throw error; return rankLexical(items || [], query, textFn, k); }
  } };
}
function createIndexedVoiceRetriever(options = {}) { return createIndexedRetriever({ ...options, domain: 'voice', textFn: options.textFn || exampleSearchText }); }
function createIndexedLoreRetriever(options = {}) { return createIndexedRetriever({ ...options, domain: 'lore', textFn: options.textFn || loreSearchText }); }

module.exports = { fingerprint, cosineSimilarity, PersistentEmbeddingIndex, createIndexedVoiceRetriever, createIndexedLoreRetriever };
