#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { loadCharacterPack } = require('../character/character-pack');

const id = process.argv[2];
if (!id) {
  console.error('usage: node src/cli/validate-pack.js <character-id> [characters-root]');
  process.exit(2);
}

try {
  const root = path.resolve(process.argv[3] || path.join(process.cwd(), 'characters'));
  const pack = loadCharacterPack(root, id);
  console.log(JSON.stringify({
    ok: true,
    id: pack.id,
    displayName: pack.definition.displayName,
    examples: pack.examples.length,
    lore: pack.lore.length,
    hasPersona: Boolean(pack.persona),
    hasRules: Boolean(pack.rules),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
