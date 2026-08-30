#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { ClaudeCliProvider } = require('../providers/claude-cli');
const { buildPersonaFromCorpus } = require('../build/persona-builder');

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((x) => x.startsWith(prefix))?.slice(prefix.length) || null;
}

const character = arg('character');
const corpus = arg('corpus');
if (!character || !corpus) {
  console.error('usage: node src/cli/build-persona.js --character=<id> --corpus=<file.jsonl> [--model=sonnet] [--examples-only]');
  process.exit(2);
}

const characterDir = path.resolve(arg('characters-root') || 'characters', character);
const examplesOnly = process.argv.includes('--examples-only');
const provider = examplesOnly ? null : new ClaudeCliProvider({
  bin: arg('claude-bin') || 'claude',
  model: arg('model') || 'sonnet',
});

buildPersonaFromCorpus({
  characterDir,
  corpusPath: path.resolve(corpus),
  provider,
  examplesOnly,
}).then((result) => {
  console.log(JSON.stringify({
    ok: true,
    character,
    corpusSize: result.corpusSize,
    examples: result.examples,
    stats: result.stats,
    wrotePersona: Boolean(result.persona),
  }, null, 2));
}).catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
