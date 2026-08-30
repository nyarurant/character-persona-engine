'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DiscordBotAdapter } = require('../src');

test('Discord adapter handles a direct message then an in-window follow-up', async () => {
  const calls = [];
  const sent = [];
  const cache = new Map();
  const engine = { async respond(turn) { calls.push(turn); return { text: 'ok' }; } };
  const channel = {
    messages: { cache },
    async send(payload) { sent.push(['send', payload]); return payload; },
  };
  const makeMessage = (id, content) => ({
    id: String(id),
    channelId: 'c1',
    guildId: 'g1',
    createdTimestamp: Number(id),
    content,
    author: { id: 'u1', username: 'user', bot: false },
    member: { displayName: 'User' },
    channel,
    mentions: { has: (value) => value === 'bot', users: new Map([['bot', {}]]) },
    async reply(payload) { sent.push(['reply', payload]); return payload; },
  });

  const adapter = new DiscordBotAdapter({ engine, botUserId: 'bot' });
  const direct = makeMessage(1, 'hello');
  cache.set(direct.id, direct);
  let result = await adapter.handleMessage(direct);
  assert.equal(result.handled, true);
  assert.equal(sent[0][0], 'reply');

  const followUp = makeMessage(2, 'again');
  followUp.mentions = { has: () => false, users: new Map() };
  cache.set(followUp.id, followUp);
  result = await adapter.handleMessage(followUp);
  assert.equal(result.handled, true);
  assert.equal(sent[1][0], 'send');
  assert.equal(calls[1].triggerType, 'follow-up');
  assert.equal(calls[1].messageId, '2');
});
