'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { createApplication } = require('../src/cli/run-discord');

test('Discord runner requires an explicit allowed scope by default', () => {
  const temp = path.join(os.tmpdir(), `cpe-runner-${process.pid}-${Date.now()}`);
  assert.throws(() => createApplication({
    rootDir: temp,
    config: {
      character: 'sample-character',
      charactersDir: path.join(__dirname, '..', 'characters'),
      retrieval: { mode: 'lexical' },
      runtime: { dataDir: path.join(temp, 'runtime') },
      discord: { tokenEnv: 'CPE_TEST_TOKEN', allowedChannelIds: [], allowedGuildIds: [] },
    },
  }), /allowedChannelIds or discord\.allowedGuildIds is required/);
});
