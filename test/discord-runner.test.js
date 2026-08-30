'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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

test('Discord runner constructs episodic and embedding stores from config without connecting', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-runner-'));
  const previous = process.env.CPE_TEST_TOKEN;
  process.env.CPE_TEST_TOKEN = 'test-token-not-used-for-login';
  try {
    const app = createApplication({
      rootDir: root,
      config: {
        character: 'sample-character',
        charactersDir: path.join(__dirname, '..', 'characters'),
        retrieval: { mode: 'hybrid', persistentCache: true },
        runtime: {
          dataDir: path.join(root, 'runtime'),
          episodicRecall: true,
          userProfiles: { u1: 'old friend' },
        },
        discord: { tokenEnv: 'CPE_TEST_TOKEN', allowAll: true },
      },
    });
    assert.ok(app.stores.episodicStore);
    assert.ok(app.stores.embeddingCache);
    assert.equal(app.engine.engine.runtimeContext.userProfiles.u1, 'old friend');
  } finally {
    if (previous == null) delete process.env.CPE_TEST_TOKEN;
    else process.env.CPE_TEST_TOKEN = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
