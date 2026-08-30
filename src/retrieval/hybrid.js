'use strict';

const { overlapScore, exampleSearchText, loreSearchText, rankLexical } = require('./lexical');

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = Number(a[index]);
    const y = Number(b[index]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

class OllamaEmbedder {
  constructor({ baseUrl = 'http://127.0.0.1:11434', model = 'bge-m3', fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    this.baseUrl = String(baseUrl).replace(/\/$/u, '');
    this.model = model;
    this.cacheKey = `ollama:${this.baseUrl}:${this.model}`;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async embed(texts) {
    const input = Array.isArray(texts) ? texts : [texts];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Ollama embed failed: HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.embeddings) || data.embeddings.length !== input.length) {
        throw new Error('Ollama embed returned invalid embeddings');
      }
      return data.embeddings;
    } finally {
      clearTimeout(timer);
    }
  }
}

class HybridRetriever {
  constructor({
    embedder,
    textFn,
    lexicalWeight = 0.35,
    semanticWeight = 0.65,
    fallbackOnError = true,
    embeddingCache = null,
    cacheNamespace = 'default',
  } = {}) {
    if (!embedder || typeof embedder.embed !== 'function') throw new TypeError('embedder.embed is required');
    if (typeof textFn !== 'function') throw new TypeError('textFn is required');
    this.embedder = embedder;
    this.textFn = textFn;
    this.lexicalWeight = lexicalWeight;
    this.semanticWeight = semanticWeight;
    this.fallbackOnError = fallbackOnError;
    this.embeddingCache = embeddingCache;
    this.cacheNamespace = cacheNamespace;
    this.cache = new WeakMap();
  }

  async _vectors(items) {
    let cached = this.cache.get(items);
    if (cached) return cached;
    const texts = items.map(this.textFn);
    const vectorPromise = this.embeddingCache?.embedTexts
      ? this.embeddingCache.embedTexts(texts, this.embedder, this.cacheNamespace)
      : this.embedder.embed(texts);
    const promise = Promise.resolve(vectorPromise).then((vectors) => ({ texts, vectors }));
    this.cache.set(items, promise);
    try {
      return await promise;
    } catch (error) {
      this.cache.delete(items);
      throw error;
    }
  }

  invalidateMemoryCache() {
    this.cache = new WeakMap();
  }

  async retrieve(items, query, k = 6) {
    const list = items || [];
    if (!list.length || !String(query || '').trim()) return [];
    try {
      const [{ vectors }, queryVectors] = await Promise.all([
        this._vectors(list),
        this.embedder.embed([query]),
      ]);
      const queryVector = queryVectors[0];
      return list
        .map((item, index) => {
          const lexical = overlapScore(query, this.textFn(item));
          const semantic = Math.max(0, cosineSimilarity(queryVector, vectors[index]));
          return {
            item,
            index,
            lexical,
            semantic,
            score: this.lexicalWeight * lexical + this.semanticWeight * semantic,
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, Math.max(0, k))
        .map(({ item, score, lexical, semantic }) => ({
          ...item,
          _score: Number(score.toFixed(4)),
          _lexicalScore: Number(lexical.toFixed(4)),
          _semanticScore: Number(semantic.toFixed(4)),
        }));
    } catch (error) {
      if (!this.fallbackOnError) throw error;
      return rankLexical(list, query, this.textFn, k);
    }
  }
}

function createVoiceHybridRetriever(options = {}) {
  return new HybridRetriever({ ...options, textFn: options.textFn || exampleSearchText, cacheNamespace: options.cacheNamespace || 'voice' });
}

function createLoreHybridRetriever(options = {}) {
  return new HybridRetriever({ ...options, textFn: options.textFn || loreSearchText, cacheNamespace: options.cacheNamespace || 'lore' });
}

module.exports = {
  cosineSimilarity,
  OllamaEmbedder,
  HybridRetriever,
  createVoiceHybridRetriever,
  createLoreHybridRetriever,
};
