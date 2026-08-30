'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MemoryStore } = require('../src/memory/memory-store');
const { EpisodicStore } = require('../src/memory/episodic-store');
const { AffinityStore } = require('../src/state/affinity-store');
const { ConversationStateStore } = require('../src/state/conversation-state');
const { RuntimeContext } = require('../src/runtime/runtime-context');

function tempFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-state-'));
  return { dir, file: path.join(dir, name) };
}

test('memory store deduplicates and retrieves per speaker', () => {
  const { dir, file } = tempFile('memory.json');
  const store = new MemoryStore({ filePath: file });
  store.remember({ subjectId: 'u1', subjectName: 'A', fact: '猫が好き', category: 'preference', confidence: 0.8 });
  const second = store.remember({ subjectId: 'u1', subjectName: 'A', fact: '猫 が 好き', category: 'preference', confidence: 0.95 });
  store.remember({ subjectId: 'u2', subjectName: 'B', fact: '犬が好き', category: 'preference' });
  assert.equal(second.deduplicated, true);
  assert.equal(store.retrieve('u1', '猫', 4).length, 1);
  assert.equal(store.retrieve('u1', '猫', 4)[0].confidence, 0.95);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('memory store rejects credential-like facts', () => {
  const { dir, file } = tempFile('memory.json');
  const store = new MemoryStore({ filePath: file });
  assert.throws(() => store.remember({ subjectId: 'u1', fact: 'API_KEY=sk-secret-example', category: 'general' }), /sensitive-looking/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('episodic store is separate, deduplicated, expiring, and sensitivity guarded', () => {
  const { dir, file } = tempFile('episodes.json');
  const store = new EpisodicStore({ filePath: file, defaultTtlDays: 10 });
  const now = new Date('2026-08-30T00:00:00Z');
  const first = store.add({ subjectId: 'u1', summary: '一緒に変なバグで笑った' }, now);
  const second = store.add({ subjectId: 'u1', summary: '一緒に変なバグで笑った' }, new Date('2026-08-31T00:00:00Z'));
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(store.retrieve('u1', 'バグ', 4, now).length, 1);
  assert.throws(() => store.add({ subjectId: 'u1', summary: '持病の診断について話した' }, now), /sensitive-looking/);
  assert.equal(store.retrieve('u1', '', 4, new Date('2026-09-20T00:00:00Z')).length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('affinity store moves through generic tiers', () => {
  const { dir, file } = tempFile('affinity.json');
  const store = new AffinityStore({ filePath: file, favorableThreshold: 2, closeThreshold: 4 });
  assert.equal(store.adjust('u1', 2).tier, 'favorable');
  assert.equal(store.adjust('u1', 2).tier, 'close');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runtime context separates durable memory and episodes and prioritizes manual profiles', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-context-'));
  const memory = new MemoryStore({ filePath: path.join(root, 'memory.json') });
  const episodes = new EpisodicStore({ filePath: path.join(root, 'episodes.json') });
  const affinity = new AffinityStore({ filePath: path.join(root, 'affinity.json'), favorableThreshold: 1, closeThreshold: 3 });
  const conversation = new ConversationStateStore({ filePath: path.join(root, 'conversation.json'), ttlMs: 10 * 60 * 1000 });
  memory.remember({ subjectId: 'u1', fact: 'コーヒーが好き', category: 'preference' });
  episodes.add({ subjectId: 'u1', summary: '深夜にコーヒーをこぼして二人で笑った' });
  affinity.adjust('u1', 1);
  const runtime = new RuntimeContext({
    memoryStore: memory,
    episodicStore: episodes,
    affinityStore: affinity,
    conversationStateStore: conversation,
    affinityNotes: { favorable: 'comfortable acquaintance' },
    userProfiles: { u1: 'old friend with a dry teasing dynamic' },
    defaultUserProfile: 'stranger',
  });
  const resolved = runtime.resolve({ speakerId: 'u1', scopeId: 'c1', query: 'コーヒー' });
  assert.equal(resolved.memories.length, 1);
  assert.equal(resolved.episodes.length, 1);
  assert.equal(resolved.relationshipNote, 'old friend with a dry teasing dynamic');
  assert.equal(resolved.relationshipSource, 'profile');
  assert.equal(runtime.resolve({ speakerId: 'unknown', query: '' }).relationshipNote, 'stranger');
  fs.rmSync(root, { recursive: true, force: true });
});

test('temporary conversation state expires', () => {
  const { dir, file } = tempFile('conversation.json');
  const conversation = new ConversationStateStore({ filePath: file, ttlMs: 10 * 60 * 1000 });
  conversation.set('c1', { topic: 'night', expiresInMinutes: 5 }, 1_000_000);
  assert.equal(conversation.get('c1', 1_000_000)?.topic, 'night');
  assert.equal(conversation.get('c1', 1_000_000 + 6 * 60 * 1000), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
