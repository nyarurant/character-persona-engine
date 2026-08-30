'use strict';

const { readJsonFile, writeJsonAtomic } = require('./atomic-json');

class AffinityStore {
  constructor({ filePath, favorableThreshold = 8, closeThreshold = 25 } = {}) {
    if (!filePath) throw new TypeError('filePath is required');
    if (!(closeThreshold > favorableThreshold)) throw new TypeError('closeThreshold must be greater than favorableThreshold');
    this.filePath = filePath;
    this.favorableThreshold = favorableThreshold;
    this.closeThreshold = closeThreshold;
    const parsed = readJsonFile(filePath, { version: 1, subjects: {} });
    this.subjects = parsed.subjects && typeof parsed.subjects === 'object' ? parsed.subjects : {};
  }

  tierFor(score) {
    if (score >= this.closeThreshold) return 'close';
    if (score >= this.favorableThreshold) return 'favorable';
    return 'neutral';
  }

  get(subjectId) {
    const record = this.subjects[String(subjectId)];
    return record ? { ...record } : { score: 0, tier: 'neutral', updatedAt: null };
  }

  adjust(subjectId, delta, now = new Date()) {
    const id = String(subjectId || '').trim();
    if (!id) throw new TypeError('subjectId is required');
    const amount = Number(delta);
    if (!Number.isFinite(amount)) throw new TypeError('delta must be finite');
    const current = this.get(id);
    const score = Math.max(0, current.score + amount);
    const record = { score, tier: this.tierFor(score), updatedAt: new Date(now).toISOString() };
    this.subjects[id] = record;
    writeJsonAtomic(this.filePath, { version: 1, subjects: this.subjects });
    return { ...record };
  }
}

module.exports = { AffinityStore };
