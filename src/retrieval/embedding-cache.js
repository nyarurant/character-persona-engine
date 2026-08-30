'use strict';

const crypto = require('node:crypto');
const { readJsonFile, writeJsonAtomic } = require('../state/atomic-json');

function fingerprint(text) {
  return crypto.createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

class PersistentEmbeddingCache {
  constructor({ filePath, maxEntries = 50000 } = {}) {
    if (!filePath) throw new TypeError('filePath is required');
    this.filePath = filePath;
    this.maxEntries = maxEntries;
    const parsed = readJsonFile(filePath, { version: 1, entries: {} });
    this.entries = parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
  }

  save() {
    writeJsonAtomic(this.filePath, { version: 1, entries: this.entries });
  }

  async embedTexts(texts, embedder, namespace = 'default') {
    if (!embedder || typeof embedder.embed !== 'function') throw new TypeError('embedder.embed is required');
    const input = Array.isArray(texts) ? texts.map(String) : [String(texts ?? '')];
    const modelKey = String(embedder.cacheKey || embedder.model || 'default');
    const hashes = input.map(fingerprint);
    const keys = hashes.map((hash) => `${namespace}:${modelKey}:${hash}`);
    const vectors = new Array(input.length);
    const missingIndices = [];

    for (let index = 0; index < keys.length; index += 1) {
      const entry = this.entries[keys[index]];
      if (entry && Array.isArray(entry.vector)) vectors[index] = entry.vector;
      else missingIndices.push(index);
    }

    if (missingIndices.length) {
      const missingTexts = missingIndices.map((index) => input[index]);
      const embedded = await embedder.embed(missingTexts);
      if (!Array.isArray(embedded) || embedded.length !== missingIndices.length) {
        throw new Error('embedder returned unexpected vector count');
      }
      const now = new Date().toISOString();
      missingIndices.forEach((index, offset) => {
        const vector = embedded[offset];
        if (!Array.isArray(vector)) throw new Error('embedder returned an invalid vector');
        vectors[index] = vector;
        this.entries[keys[index]] = {
          namespace,
          modelKey,
          hash: hashes[index],
          vector,
          updatedAt: now,
        };
      });
    }

    const active = new Set(keys);
    let changed = missingIndices.length > 0;
    for (const [key, entry] of Object.entries(this.entries)) {
      if (entry?.namespace === namespace && entry?.modelKey === modelKey && !active.has(key)) {
        delete this.entries[key];
        changed = true;
      }
    }

    const allEntries = Object.entries(this.entries);
    if (allEntries.length > this.maxEntries) {
      allEntries
        .sort((a, b) => Date.parse(a[1]?.updatedAt || 0) - Date.parse(b[1]?.updatedAt || 0))
        .slice(0, allEntries.length - this.maxEntries)
        .forEach(([key]) => { delete this.entries[key]; });
      changed = true;
    }

    if (changed) this.save();
    return vectors;
  }

  clearNamespace(namespace) {
    let changed = 0;
    for (const [key, entry] of Object.entries(this.entries)) {
      if (entry?.namespace !== namespace) continue;
      delete this.entries[key];
      changed += 1;
    }
    if (changed) this.save();
    return changed;
  }
}

module.exports = { PersistentEmbeddingCache, fingerprint };
