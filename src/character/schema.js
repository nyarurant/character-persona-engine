'use strict';

const CURRENT_CHARACTER_SCHEMA_VERSION = 2;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function migrateV1ToV2(input) {
  const value = clone(input);
  value.identity = value.identity && typeof value.identity === 'object' ? value.identity : {};
  if (Array.isArray(value.aliases) && !Array.isArray(value.identity.aliases)) {
    value.identity.aliases = value.aliases;
  }
  delete value.aliases;
  value.schemaVersion = 2;
  return value;
}

const MIGRATIONS = new Map([[1, migrateV1ToV2]]);

function migrateCharacterDefinition(input, { targetVersion = CURRENT_CHARACTER_SCHEMA_VERSION } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('character definition must be an object');
  }
  let value = clone(input);
  let version = Number(value.schemaVersion);
  if (!Number.isInteger(version) || version < 1) throw new Error('character.json schemaVersion must be a positive integer');
  if (version > targetVersion) throw new Error(`character schema ${version} is newer than supported target ${targetVersion}`);
  while (version < targetVersion) {
    const migration = MIGRATIONS.get(version);
    if (!migration) throw new Error(`no character schema migration from version ${version}`);
    value = migration(value);
    version = Number(value.schemaVersion);
  }
  return {
    definition: value,
    fromVersion: Number(input.schemaVersion),
    toVersion: version,
    migrated: Number(input.schemaVersion) !== version,
  };
}

module.exports = {
  CURRENT_CHARACTER_SCHEMA_VERSION,
  migrateCharacterDefinition,
  migrateV1ToV2,
};
