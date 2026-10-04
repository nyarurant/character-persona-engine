'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LocalConversationAdapter } = require('../src');

test('local conversation sends recent user and character history', async () => {
  const turns = [];
  const replies = [];
  const adapter = new LocalConversationAdapter({
    engine: { async respond(turn) { turns.push(turn); return { text: turns.length === 1 ? 'ん、おはよ' : '別に、ひまだけど' }; } },
    speaker: { id: 'owner', name: 'プロキシ' },
    scopeId: 'ellen-local',
    onReply: async (result) => replies.push(result.text),
  });
  await adapter.respond('おはよう');
  await adapter.respond('今日ひま？');
  assert.equal(turns[0].history.length, 0);
  assert.deepEqual(turns[1].history.map((entry) => entry.content), ['おはよう', 'ん、おはよ']);
  assert.deepEqual(replies, ['ん、おはよ', '別に、ひまだけど']);
  adapter.reset();
  assert.deepEqual(adapter.history(), []);
});
