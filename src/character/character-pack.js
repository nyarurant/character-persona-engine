'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CURRENT_CHARACTER_SCHEMA_VERSION, migrateCharacterDefinition } = require('./schema');

function readOptionalText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8').trim(); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateExampleRecord(value, location = 'example') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location}: example must be an object`);
  if (value.id != null && !nonEmptyString(value.id)) throw new Error(`${location}: id must be a non-empty string`);
  const hasContent = nonEmptyString(value.content);
  const hasParts = Array.isArray(value.parts) && value.parts.length > 0 && value.parts.every(nonEmptyString);
  if (!hasContent && !hasParts) throw new Error(`${location}: example needs non-empty content or parts`);
  if (value.parts != null && !hasParts) throw new Error(`${location}: parts must be a non-empty array of strings`);
  if (value.context != null) {
    if (!Array.isArray(value.context)) throw new Error(`${location}: context must be an array`);
    value.context.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !nonEmptyString(entry.content)) {
        throw new Error(`${location}: context[${index}] must contain non-empty content`);
      }
      if (entry.authorName != null && typeof entry.authorName !== 'string') throw new Error(`${location}: context[${index}].authorName must be a string`);
    });
  }
  if (value.repliedTo != null) {
    if (!value.repliedTo || typeof value.repliedTo !== 'object' || Array.isArray(value.repliedTo) || !nonEmptyString(value.repliedTo.content)) {
      throw new Error(`${location}: repliedTo must contain non-empty content`);
    }
    if (value.repliedTo.authorName != null && typeof value.repliedTo.authorName !== 'string') throw new Error(`${location}: repliedTo.authorName must be a string`);
  }
  return value;
}

function validateLoreRecord(value, location = 'lore') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location}: lore entry must be an object`);
  if (value.id != null && !nonEmptyString(value.id)) throw new Error(`${location}: id must be a non-empty string`);
  if (!nonEmptyString(value.fact) && !nonEmptyString(value.content)) throw new Error(`${location}: lore entry needs non-empty fact or content`);
  if (value.title != null && typeof value.title !== 'string') throw new Error(`${location}: title must be a string`);
  if (value.tags != null && (!Array.isArray(value.tags) || !value.tags.every(nonEmptyString))) throw new Error(`${location}: tags must be an array of non-empty strings`);
  return value;
}

function readJsonl(filePath, validator = null) {
  const text = readOptionalText(filePath);
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    let value;
    try { value = JSON.parse(line); }
    catch (error) { throw new Error(`${filePath}:${index + 1}: invalid JSON: ${error.message}`); }
    if (validator) validator(value, `${filePath}:${index + 1}`);
    return value;
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
  if (!nonEmptyString(definition.displayName)) throw new Error('displayName is required');
  if (!definition.identity || typeof definition.identity !== 'object' || Array.isArray(definition.identity)) throw new Error('identity is required');
  if (!nonEmptyString(definition.identity.selfDescription)) throw new Error('identity.selfDescription is required');
  if (definition.identity.aliases != null && (!Array.isArray(definition.identity.aliases) || !definition.identity.aliases.every(nonEmptyString))) {
    throw new Error('identity.aliases must be an array of non-empty strings');
  }
  if (definition.generation != null) {
    if (typeof definition.generation !== 'object' || Array.isArray(definition.generation)) throw new Error('generation must be an object');
    const generation = definition.generation;
    if (generation.defaultMaxCharacters != null && (!Number.isInteger(generation.defaultMaxCharacters) || generation.defaultMaxCharacters < 1)) {
      throw new Error('generation.defaultMaxCharacters must be a positive integer');
    }
    if (generation.defaultExampleCount != null && (!Number.isInteger(generation.defaultExampleCount) || generation.defaultExampleCount < 0)) {
      throw new Error('generation.defaultExampleCount must be a non-negative integer');
    }
    if (generation.constraints != null && (!Array.isArray(generation.constraints) || !generation.constraints.every(nonEmptyString))) {
      throw new Error('generation.constraints must be an array of non-empty strings');
    }
  }
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
    examples: readJsonl(path.join(packDir, 'examples.jsonl'), validateExampleRecord),
    lore: readJsonl(path.join(packDir, 'lore.jsonl'), validateLoreRecord),
  });
}

module.exports = {
  loadCharacterPack,
  readJsonl,
  validateDefinition,
  validateExampleRecord,
  validateLoreRecord,
};
