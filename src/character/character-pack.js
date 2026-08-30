'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readOptionalText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function readJsonl(filePath) {
  const text = readOptionalText(filePath);
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${filePath}:${index + 1}: invalid JSON: ${error.message}`);
    }
  });
}

function assertPackId(id) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(String(id || ''))) {
    throw new Error(`invalid character id: ${JSON.stringify(id)}`);
  }
}

function validateDefinition(definition, requestedId) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new Error('character.json must contain an object');
  }
  if (definition.schemaVersion !== 1) throw new Error('character.json schemaVersion must be 1');
  assertPackId(definition.id);
  if (definition.id !== requestedId) {
    throw new Error(`character id mismatch: directory=${requestedId} character.json=${definition.id}`);
  }
  if (!String(definition.displayName || '').trim()) throw new Error('displayName is required');
  if (!definition.identity || typeof definition.identity !== 'object') throw new Error('identity is required');
  if (!String(definition.identity.selfDescription || '').trim()) {
    throw new Error('identity.selfDescription is required');
  }
}

function loadCharacterPack(charactersRoot, id) {
  assertPackId(id);
  const root = path.resolve(charactersRoot);
  const packDir = path.resolve(root, id);
  if (packDir !== root && !packDir.startsWith(`${root}${path.sep}`)) {
    throw new Error('character path escapes characters root');
  }
  const definitionPath = path.join(packDir, 'character.json');
  const definition = JSON.parse(fs.readFileSync(definitionPath, 'utf8'));
  validateDefinition(definition, id);

  return Object.freeze({
    id,
    dir: packDir,
    definition: Object.freeze(definition),
    persona: readOptionalText(path.join(packDir, 'persona.md')),
    rules: readOptionalText(path.join(packDir, 'rules.md')),
    examples: readJsonl(path.join(packDir, 'examples.jsonl')),
    lore: readJsonl(path.join(packDir, 'lore.jsonl')),
  });
}

module.exports = { loadCharacterPack, readJsonl, validateDefinition };
