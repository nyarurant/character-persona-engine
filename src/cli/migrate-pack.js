'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { migrateCharacterDefinition } = require('../character/schema');

function parseArgs(argv) {
  const result = { write: false, file: null };
  for (const arg of argv) {
    if (arg === '--write') result.write = true;
    else if (arg.startsWith('--file=')) result.file = arg.slice('--file='.length);
    else if (!result.file) result.file = arg;
  }
  return result;
}

function migrateFile(filePath, { write = false } = {}) {
  const absolute = path.resolve(filePath);
  const source = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const result = migrateCharacterDefinition(source);
  const text = JSON.stringify(result.definition, null, 2) + '\n';
  if (write && result.migrated) fs.writeFileSync(absolute, text, 'utf8');
  return { ...result, text, filePath: absolute };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) throw new Error('usage: migrate-pack <character.json> [--write]');
  const result = migrateFile(args.file, { write: args.write });
  if (!args.write) process.stdout.write(result.text);
  else console.log(`${result.filePath}: schema ${result.fromVersion} -> ${result.toVersion}${result.migrated ? '' : ' (already current)'}`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.stack || error.message || error);
    process.exit(1);
  }
}

module.exports = { parseArgs, migrateFile };
