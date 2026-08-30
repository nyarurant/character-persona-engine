'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readCorpusJsonl, stableSample, computeCorpusStats } = require('./corpus');

const ANALYSIS_SYSTEM_PROMPT = `You analyze dialogue from one fictional or roleplayed character and produce an evidence-grounded character voice profile. Do not invent canon, biography, relationships, or traits unsupported by repeated evidence. Distinguish stable behavior from scene-specific emotion. Write a practical Markdown profile for an LLM roleplay runtime. Focus on temperament, decisions, social distance, emotional expression, pacing, sentence shape, vocabulary, fillers, humor, uncertainty, affection, frustration, and concrete reproduction rules. Do not copy long source passages.`;

function formatSample(message) {
  const lines = [];
  if (message.context.length) {
    lines.push(`Context: ${message.context.map((x) => `${x.authorName}: ${x.content}`).join(' / ')}`);
  }
  if (message.repliedTo) lines.push(`Replying to ${message.repliedTo.authorName}: ${message.repliedTo.content}`);
  lines.push(`Character: ${message.content}`);
  return lines.join('\n');
}

function writeJsonl(filePath, records) {
  fs.writeFileSync(filePath, records.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
}

async function buildPersonaFromCorpus({
  characterDir,
  corpusPath,
  provider,
  exampleCount = 500,
  analysisSampleCount = 700,
  examplesOnly = false,
} = {}) {
  if (!characterDir) throw new TypeError('characterDir is required');
  if (!corpusPath) throw new TypeError('corpusPath is required');
  const corpus = readCorpusJsonl(corpusPath);
  if (!corpus.length) throw new Error('corpus is empty after cleaning');

  fs.mkdirSync(characterDir, { recursive: true });
  const examples = stableSample(corpus, Math.min(exampleCount, corpus.length), 'examples');
  writeJsonl(path.join(characterDir, 'examples.jsonl'), examples);
  const stats = computeCorpusStats(corpus);
  if (examplesOnly) return { corpusSize: corpus.length, examples: examples.length, stats, persona: null };
  if (!provider || typeof provider.generate !== 'function') throw new TypeError('provider.generate is required');

  const sample = stableSample(corpus, Math.min(analysisSampleCount, corpus.length), 'persona');
  const userPrompt = `Corpus statistics:\n${JSON.stringify(stats, null, 2)}\n\n` +
    `Contextual dialogue samples (${sample.length}):\n\n${sample.map(formatSample).join('\n\n---\n\n')}\n\n` +
    'Produce the character persona profile now.';
  const result = await provider.generate({
    characterId: path.basename(path.resolve(characterDir)),
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    userPrompt,
    purpose: 'persona-build',
  });
  const persona = String(typeof result === 'string' ? result : result?.text || '').trim();
  if (!persona) throw new Error('provider returned an empty persona');
  fs.writeFileSync(path.join(characterDir, 'persona.md'), persona + '\n', 'utf8');
  return { corpusSize: corpus.length, examples: examples.length, stats, persona };
}

module.exports = { ANALYSIS_SYSTEM_PROMPT, buildPersonaFromCorpus };
