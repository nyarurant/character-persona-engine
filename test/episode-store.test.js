'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { EpisodeStore } = require('../src');
test('episode store persists, retrieves, deduplicates, and rejects sensitive summaries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-')); const file = path.join(dir, 'episodes.json'); const store = new EpisodeStore({ filePath: file });
  const first = store.add({ subjectId: 'u1', subjectName: 'A', summary: '一緒に深夜までゲームして最後に逆転した', tags: ['game'] }, new Date('2026-01-01'));
  assert.equal(first.deduplicated, false);
  const second = store.add({ subjectId: 'u1', summary: '一緒に深夜までゲームして最後に逆転した', tags: ['win'] }, new Date('2026-01-02'));
  assert.equal(second.deduplicated, true);
  assert.deepEqual(store.retrieve('u1', 'ゲーム 逆転', 2, new Date('2026-01-03'))[0].tags.sort(), ['game', 'win']);
  assert.throws(() => store.add({ subjectId: 'u1', summary: '住所は東京都新宿区1-2-3' }), /sensitive/i);
  assert.equal(new EpisodeStore({ filePath: file }).retrieve('u1', 'ゲーム', 2).length, 1);
});
