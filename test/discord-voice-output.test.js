'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectVoiceIntent, DiscordVoiceOutput } = require('../src');

test('detectVoiceIntent recognizes explicit Japanese join and leave requests only', () => {
  assert.equal(detectVoiceIntent('通話入ってほしい'), 'join');
  assert.equal(detectVoiceIntent('VC来て'), 'join');
  assert.equal(detectVoiceIntent('そろそろ通話抜けて'), 'leave');
  assert.equal(detectVoiceIntent('今日は通話の話してた'), null);
  assert.equal(detectVoiceIntent('入って'), null);
});

test('Discord voice output joins only on request, then speaks normal replies until leave', async () => {
  const events = [];
  const connected = new Set();
  const connector = {
    async join(channel) { events.push(['join', channel.id]); connected.add(channel.guild.id); },
    isConnected(guildId) { return connected.has(String(guildId)); },
    async play(guildId, filePath) { events.push(['play', guildId, filePath]); },
    leave(guildId) { events.push(['leave', guildId]); return connected.delete(String(guildId)); },
    stop() { connected.clear(); },
  };
  let sequence = 0;
  const tts = { async speak(text, options) { events.push(['tts', text, options.play]); sequence += 1; return [{ outputPath: `missing-test-${sequence}.wav` }]; } };
  const output = new DiscordVoiceOutput({ tts, connector, keepWavFiles: true });
  const channel = { id: 'vc1', guild: { id: 'g1' } };
  const message = (content) => ({ guildId: 'g1', content, member: { voice: { channel } } });

  let result = await output.handleReply({ text: 'まだ入らない' }, message('普通の話'));
  assert.equal(result.reason, 'not-connected');
  assert.deepEqual(events, []);

  result = await output.handleReply({ text: 'ん、行く' }, message('通話入ってほしい'));
  assert.equal(result.reason, 'played');
  assert.deepEqual(events.slice(0, 3), [['join', 'vc1'], ['tts', 'ん、行く', false], ['play', 'g1', 'missing-test-1.wav']]);

  await output.handleReply({ text: 'なに？' }, message('聞こえる？'));
  assert.equal(events.filter(([type]) => type === 'join').length, 1);
  assert.equal(events.filter(([type]) => type === 'play').length, 2);

  result = await output.handleReply({ text: 'じゃあね' }, message('VC抜けて'));
  assert.equal(result.reason, 'left');
  assert.equal(events.at(-1)[0], 'leave');
});

test('Discord voice output does not join when requester is not in a VC', async () => {
  const output = new DiscordVoiceOutput({
    tts: { async speak() { throw new Error('must not synthesize'); } },
    connector: { async join() {}, async play() {}, isConnected() { return false; }, leave() {}, stop() {} },
  });
  const result = await output.handleReply({ text: '行く' }, { guildId: 'g1', content: '通話入って', member: { voice: { channel: null } } });
  assert.equal(result.reason, 'author-not-in-voice');
});
