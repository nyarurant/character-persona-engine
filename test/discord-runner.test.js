'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createApplication, readEnvValue } = require('../src/cli/run-discord');

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

test('Discord runner reads only the requested token key from an env file', (t) => {
  const temp = path.join(os.tmpdir(), `cpe-env-${process.pid}-${Date.now()}.env`);
  t.after(() => fs.rmSync(temp, { force: true }));
  fs.writeFileSync(temp, 'OTHER=value\nELLEN_DISCORD_BOT_TOKEN="test-token"\n', 'utf8');
  assert.equal(readEnvValue(temp, 'ELLEN_DISCORD_BOT_TOKEN'), 'test-token');
  assert.equal(readEnvValue(temp, 'MISSING'), null);
});

test('Discord runner builds opt-in voice output from a real config root', (t) => {
  const previous = process.env.CPE_TEST_TOKEN;
  process.env.CPE_TEST_TOKEN = 'test-token';
  t.after(() => {
    if (previous == null) delete process.env.CPE_TEST_TOKEN;
    else process.env.CPE_TEST_TOKEN = previous;
  });
  const rootDir = path.join(__dirname, '..');
  const app = createApplication({
    rootDir,
    config: {
      character: 'sample-character',
      charactersDir: './characters',
      retrieval: { mode: 'lexical' },
      runtime: { dataDir: path.join(os.tmpdir(), `cpe-voice-app-${process.pid}-${Date.now()}`), memoryReview: false, conversationReview: false },
      discord: {
        tokenEnv: 'CPE_TEST_TOKEN',
        allowedChannelIds: ['c1'],
        reviewMode: 'off',
        voiceOutput: { enabled: true, outputDir: './runtime-data/test-voice' },
      },
    },
  });
  assert.equal(app.pack.id, 'sample-character');
  assert.ok(app.voiceOutput);
  app.voiceOutput.stop();
});
