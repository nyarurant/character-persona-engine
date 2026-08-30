'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TranscriptConversationAdapter, VoiceSttBridge } = require('../src');

test('transcript adapter keeps passive context and responds to direct transcript', async () => {
  let turn;
  const adapter = new TranscriptConversationAdapter({
    engine: { async respond(input) { turn = input; return { text: 'ok' }; } },
  });
  const passive = await adapter.handleTranscript({ text: 'さっきのボス強かった', speaker: { id: 'u2', name: 'B' }, scopeId: 'vc', timestamp: 1000 });
  assert.equal(passive.responded, false);
  const direct = await adapter.handleTranscript({ text: 'どう思う？', speaker: { id: 'u1', name: 'A' }, scopeId: 'vc', timestamp: 2000, direct: true });
  assert.equal(direct.responded, true);
  assert.equal(turn.source, 'voice-transcript');
  assert.equal(turn.history.length, 1);
  assert.equal(turn.history[0].content, 'さっきのボス強かった');
});

test('voice STT bridge sends only transcription metadata to transcript adapter', async () => {
  let received;
  const bridge = new VoiceSttBridge({
    transcriber: { async transcribe(input) { assert.ok(input.audio); return { text: 'こんにちは', confidence: 0.9 }; } },
    transcriptAdapter: { async handleTranscript(event) { received = event; return { responded: false, transcript: event, result: null }; } },
  });
  const output = await bridge.handleAudio({ audio: Buffer.from([1, 2]), speaker: { id: 'u', name: 'A' }, scopeId: 'vc' });
  assert.equal(output.transcription.text, 'こんにちは');
  assert.equal(received.text, 'こんにちは');
  assert.equal(Object.prototype.hasOwnProperty.call(received, 'audio'), false);
});
