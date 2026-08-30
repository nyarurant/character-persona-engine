'use strict';

const { readJsonFile, writeJsonAtomic } = require('./atomic-json');

class ConversationStateStore {
  constructor({ filePath, ttlMs = 30 * 60 * 1000 } = {}) {
    if (!filePath) throw new TypeError('filePath is required');
    this.filePath = filePath;
    this.ttlMs = ttlMs;
    const parsed = readJsonFile(filePath, { version: 1, scopes: {} });
    this.scopes = parsed.scopes && typeof parsed.scopes === 'object' ? parsed.scopes : {};
  }

  save() {
    writeJsonAtomic(this.filePath, { version: 1, scopes: this.scopes });
  }

  get(scopeId, now = Date.now()) {
    const key = String(scopeId);
    const record = this.scopes[key];
    if (!record) return null;
    if (!Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= now) {
      delete this.scopes[key];
      this.save();
      return null;
    }
    return JSON.parse(JSON.stringify(record));
  }

  set(scopeId, state, now = Date.now()) {
    const key = String(scopeId);
    const requested = Number(state?.expiresInMinutes) * 60 * 1000;
    const ttl = Number.isFinite(requested) ? Math.min(this.ttlMs * 2, Math.max(5 * 60 * 1000, requested)) : this.ttlMs;
    const record = {
      topic: state?.topic ?? null,
      unresolved: Array.isArray(state?.unresolved) ? state.unresolved.map(String).slice(0, 5) : [],
      participants: Array.isArray(state?.participants) ? state.participants.slice(0, 12) : [],
      tone: state?.tone ?? 'neutral',
      runningBit: state?.runningBit ?? null,
      updatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
    };
    this.scopes[key] = record;
    this.save();
    return JSON.parse(JSON.stringify(record));
  }

  prune(now = Date.now()) {
    let changed = 0;
    for (const [key, record] of Object.entries(this.scopes)) {
      if (!Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= now) {
        delete this.scopes[key];
        changed += 1;
      }
    }
    if (changed) this.save();
    return changed;
  }
}

module.exports = { ConversationStateStore };
