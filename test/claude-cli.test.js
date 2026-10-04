'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ClaudeCliProvider } = require('../src');

test('ClaudeCliProvider sends the user prompt over stdin and parses JSON', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-claude-provider-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const script = path.join(temp, process.platform === 'win32' ? 'fake-claude.cmd' : 'fake-claude');
  if (process.platform === 'win32') {
    fs.writeFileSync(script, '@echo off\r\nnode -e "let s=\'\';process.stdin.on(\'data\',d=>s+=d);process.stdin.on(\'end\',()=>console.log(JSON.stringify({result:s,usage:{output_tokens:1}})))"\r\n', 'utf8');
  } else {
    fs.writeFileSync(script, '#!/bin/sh\nnode -e "let s=\'\';process.stdin.on(\'data\',d=>s+=d);process.stdin.on(\'end\',()=>console.log(JSON.stringify({result:s,usage:{output_tokens:1}})))"\n', { mode: 0o755 });
  }
  const provider = new ClaudeCliProvider({ bin: script, model: 'test', timeoutMs: 10000 });
  const result = await provider.generate({ systemPrompt: 'secret system', userPrompt: 'こんにちは' });
  assert.equal(result.text, 'こんにちは');
  assert.equal(result.usage.output_tokens, 1);
});
