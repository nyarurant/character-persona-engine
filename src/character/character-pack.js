'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CURRENT_CHARACTER_SCHEMA_VERSION, migrateCharacterDefinition } = require('./schema');

function readOptionalText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8').trim(); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

function readJsonl(filePath) {
  const text = readOptionalText(filePath);
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${filePath}:${index + 1}: invalid JSON: ${error.message}`); }
  });
}

function assertPackId(id) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(String(id || ''))) throw new Error(`invalid character id: ${JSON.stringify(id)}`);
}

function validateDefinition(definition, requestedId) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new Error('character.json must contain an object');
  if (definition.schemaVersion !== CURRENT_CHARACTER_SCHEMA_VERSION) throw new Error(`character.json schemaVersion must be ${CURRENT_CHARACTER_SCHEMA_VERSION}`);
  assertPackId(definition.id);
  if (definition.id !== requestedId) throw new Error(`character id mismatch: directory=${requestedId} character.json=${definition.id}`);
  if (!String(definition.displayName || '').trim()) throw new Error('displayName is required');
  if (!definition.identity || typeof definition.identity !== 'object' || Array.isArray(definition.identity)) throw new Error('identity is required');
  if (!String(definition.identity.selfDescription || '').trim()) throw new Error('identity.selfDescription is required');
  if (definition.identity.aliases != null && !Array.isArray(definition.identity.aliases)) throw new Error('identity.aliases must be an array');
}

function loadCharacterPack(charactersRoot, id) {
  assertPackId(id);
  const root = path.resolve(charactersRoot);
  const packDir = path.resolve(root, id);
  if (packDir !== root && !packDir.startsWith(`${root}${path.sep}`)) throw new Error('character path escapes characters root');
  const definitionPath = path.join(packDir, 'character.json');
  const rawDefinition = JSON.parse(fs.readFileSync(definitionPath, 'utf8'));
  const migrated = migrateCharacterDefinition(rawDefinition);
  validateDefinition(migrated.definition, id);
  const definition = Object.freeze(migrated.definition);
  return Object.freeze({
    id,
    displayName: definition.displayName,
    aliases: Object.freeze([...(definition.identity.aliases || [])]),
    dir: packDir,
    definition,
    sourceSchemaVersion: migrated.fromVersion,
    persona: readOptionalText(path.join(packDir, 'persona.md')),
    rules: readOptionalText(path.join(packDir, 'rules.md')),
    examples: readJsonl(path.join(packDir, 'examples.jsonl')),
    lore: readJsonl(path.join(packDir, 'lore.jsonl')),
  });
}

module.exports = { loadCharacterPack, readJsonl, validateDefinition };
