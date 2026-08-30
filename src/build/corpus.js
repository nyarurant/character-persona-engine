'use strict';

const fs = require('node:fs');

const LOW_SIGNAL = /^(?:w{2,}|ｗ{2,}|www+|lol+|lmao+|草+|笑+)$/iu;
const PUNCT_ONLY = /^[\s.,!?！？。、ー〜~…]+$/u;

function cleanText(value) {
  return String(value || '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu, '').trim();
}

function readCorpusJsonl(filePath) {
  const messages = [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    let value;
    try { value = JSON.parse(lines[i]); }
    catch (error) { throw new Error(`${filePath}:${i + 1}: ${error.message}`); }
    const content = cleanText(value.content);
    if (!content || content.length < 2 || LOW_SIGNAL.test(content) || PUNCT_ONLY.test(content)) continue;
    messages.push({
      id: String(value.id || `line-${i + 1}`),
      timestamp: value.timestamp || null,
      content,
      parts: Array.isArray(value.parts) ? value.parts.map(cleanText).filter(Boolean) : [content],
      context: Array.isArray(value.context) ? value.context.map((x) => ({
        authorName: cleanText(x.authorName),
        content: cleanText(x.content),
      })).filter((x) => x.content) : [],
      repliedTo: value.repliedTo && cleanText(value.repliedTo.content) ? {
        authorName: cleanText(value.repliedTo.authorName),
        content: cleanText(value.repliedTo.content),
      } : null,
    });
  }
  const byId = new Map(messages.map((x) => [x.id, x]));
  return [...byId.values()];
}

function stableHash(text) {
  let hash = 2166136261;
  for (const ch of String(text)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableSample(items, count, salt = 'sample') {
  return [...items]
    .sort((a, b) => stableHash(`${salt}:${a.id}`) - stableHash(`${salt}:${b.id}`))
    .slice(0, Math.max(0, count));
}

function quantile(sorted, ratio) {
  if (!sorted.length) return 0;
  return sorted[Math.floor((sorted.length - 1) * ratio)] ?? 0;
}

function computeCorpusStats(corpus) {
  const lengths = corpus.map((x) => [...x.content].length).sort((a, b) => a - b);
  const exact = new Map();
  for (const item of corpus) exact.set(item.content, (exact.get(item.content) || 0) + 1);
  return {
    messageCount: corpus.length,
    lengthCharacters: {
      p10: quantile(lengths, 0.1),
      p25: quantile(lengths, 0.25),
      median: quantile(lengths, 0.5),
      p75: quantile(lengths, 0.75),
      p90: quantile(lengths, 0.9),
    },
    replies: corpus.filter((x) => x.repliedTo).length,
    bursts: corpus.filter((x) => x.parts.length > 1).length,
    frequentShortMessages: [...exact.entries()]
      .filter(([text]) => [...text].length <= 20)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([content, count]) => ({ content, count })),
  };
}

module.exports = { cleanText, readCorpusJsonl, stableSample, computeCorpusStats };
