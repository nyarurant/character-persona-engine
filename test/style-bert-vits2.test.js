'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StyleBertVits2Client, normalizeForSpeech, splitForSpeech } = require('../src');

function wavResponse(body = {}) {
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(16)]);
  return new Response(wav, {
    status: 200,
    headers: {
      'content-type': 'audio/wav',
      'x-generate-seconds': '1.25',
      'x-audio-seconds': '4.50',
      'x-rtf': '0.278',
      'x-sample-rate': '44100',
      ...body.headers,
    },
  });
}

test('StyleBertVits2Client writes WAV and preserves synthesis metadata', async (t) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-tts-'));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  let request;
  const client = new StyleBertVits2Client({
    outputDir,
    play: false,
    defaults: { sdp_ratio: 0.4, seed: 42 },
    fetchImpl: async (url, options) => { request = { url, options }; return wavResponse(); },
  });
  const result = await client.synthesize('急がなくてもいいでしょ');
  assert.equal(request.url, 'http://127.0.0.1:5000/synthesize');
  assert.deepEqual(JSON.parse(request.options.body), { text: '急がなくてもいいでしょ。', sdp_ratio: 0.4, seed: 42 });
  assert.equal(fs.readFileSync(result.outputPath).subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(result.generateSeconds, 1.25);
  assert.equal(result.audioSeconds, 4.5);
  assert.equal(result.sampleRate, 44100);
});

test('StyleBertVits2Client speaks chunks sequentially', async (t) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-tts-chunks-'));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const played = [];
  const client = new StyleBertVits2Client({
    outputDir,
    fetchImpl: async () => wavResponse(),
    player: { async play(filePath) { played.push(filePath); } },
  });
  const results = await client.speak('一文目です。二文目です。', { maxCharacters: 7 });
  assert.equal(results.length, 2);
  assert.deepEqual(played, results.map((entry) => entry.outputPath));
});

test('splitForSpeech keeps short text intact', () => {
  assert.deepEqual(splitForSpeech('ん…分かった。'), ['ん…分かった。']);
});

test('speech normalization preserves the good question contour while cleaning punctuation', () => {
  assert.equal(
    normalizeForSpeech('ちゃんと喋れてるでしょ。……で、なんかあった?'),
    'ちゃんと喋れてるでしょ。…で、なんかあった？',
  );
  assert.equal(
    normalizeForSpeech('聞こえてるよ、ちゃんと。なんかあった?'),
    '聞こえてるよ、ちゃんと。なんかあった？',
  );
  assert.equal(normalizeForSpeech('え？なんかあった？'), 'え？なんかあった？');
});
