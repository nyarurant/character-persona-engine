'use strict';

function normalize(text) {
  return String(text || '').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function tokenize(text) {
  const source = normalize(text);
  const tokens = new Set();
  for (const word of source.match(/[a-z0-9_+#.-]+/g) || []) tokens.add(word);
  const compact = source.replace(/[\s\p{P}\p{S}]/gu, '');
  for (let i = 0; i < compact.length; i += 1) {
    tokens.add(compact[i]);
    if (i + 1 < compact.length) tokens.add(compact.slice(i, i + 2));
    if (i + 2 < compact.length) tokens.add(compact.slice(i, i + 3));
  }
  return tokens;
}

function overlapScore(query, text) {
  const q = tokenize(query);
  const d = tokenize(text);
  if (!q.size || !d.size) return 0;
  let overlap = 0;
  for (const token of q) if (d.has(token)) overlap += 1;
  return overlap / Math.sqrt(q.size * d.size);
}

function exampleSearchText(example) {
  const context = (example.context || []).map((x) => `${x.authorName || ''} ${x.content || ''}`).join(' ');
  const replied = example.repliedTo ? `${example.repliedTo.authorName || ''} ${example.repliedTo.content || ''}` : '';
  const parts = Array.isArray(example.parts) ? example.parts.join(' ') : '';
  return `${context} ${replied} ${parts} ${example.content || ''}`;
}

function loreSearchText(entry) {
  return [entry.title, entry.fact, entry.content, ...(entry.tags || [])].filter(Boolean).join(' ');
}

function rankLexical(items, query, textFn, k = 6) {
  return (items || [])
    .map((item, index) => ({ item, score: overlapScore(query, textFn(item)), index }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, k))
    .map(({ item, score }) => ({
      ...item,
      _score: Number(score.toFixed(4)),
      _lexicalScore: Number(score.toFixed(4)),
    }));
}

function retrieveVoice(examples, query, k = 6) {
  return rankLexical(examples, query, exampleSearchText, k);
}

function retrieveLore(lore, query, k = 6) {
  return rankLexical(lore, query, loreSearchText, k);
}

module.exports = {
  normalize,
  tokenize,
  overlapScore,
  exampleSearchText,
  loreSearchText,
  rankLexical,
  retrieveVoice,
  retrieveLore,
};
