'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { migrateCharacterDefinition, CURRENT_CHARACTER_SCHEMA_VERSION } = require('../src');
test('schema v1 migrates aliases into identity for v2', () => {
  const source = { schemaVersion: 1, id: 'x', displayName: 'X', aliases: ['xx'], identity: { selfDescription: 'demo' } };
  const result = migrateCharacterDefinition(source);
  assert.equal(CURRENT_CHARACTER_SCHEMA_VERSION, 2);
  assert.equal(result.definition.schemaVersion, 2);
  assert.deepEqual(result.definition.identity.aliases, ['xx']);
  assert.equal('aliases' in result.definition, false);
  assert.equal(source.schemaVersion, 1);
});
