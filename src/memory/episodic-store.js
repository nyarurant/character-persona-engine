'use strict';

const crypto = require('node:crypto');
const { readJsonFile, writeJsonAtomic } = require('../state/atomic-json');
const { overlapScore } = require('../retrieval/lexical');
const { isSensitiveFact } = require('./memory-store');

function clean(value, max = 800) {
  return String(value ?? '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu, '').replace(/\s+/gu, ' ').trim().slice(0, max);
}

class EpisodicStore {
  constructor({ filePath, defaultTtlDays = 90, maxRecordsPerSubject = 500 } = {}) {
    if (!filePath) throw new TypeError('filePath is required');
    this.filePath = filePath;
    this.defaultTtlDays = defaultTtlDays;
    this.maxRecordsPerSubject = maxRecordsPerSubject;
    const parsed = readJsonFile(filePath, { version: 1, records: [] });
    this.records = Array.isArray(parsed.records) ? parsed.records : [];
  }

  save() {
    writeJsonAtomic(this.filePath, { version: 1, records: this.records });
  }

  add({ subjectId, subjectName = '', summary, sourceMessageId = null, scopeId = null, expiresInDays } = {}, now = new Date()) {
    const id = clean(subjectId, 128);
    const text = clean(summary, 600);
    if (!id) throw new TypeError('subjectId is required');
    if (!text) throw new TypeError('summary is required');
    if (isSensitiveFact(text)) throw new Error('refusing to persist a sensitive-looking episode');
    const ttlDays = expiresInDays == null ? this.defaultTtlDays : Number(expiresInDays);
    if (!Number.isFinite(ttlDays) || ttlDays <= 0) throw new TypeError('expiresInDays must be positive');
    const nowDate = new Date(now);
    const record = {
      id: crypto.randomUUID(),
      subjectId: id,
      subjectName: clean(subjectName, 120),
      summary: text,
      sourceMessageId: sourceMessageId == null ? null : clean(sourceMessageId, 128),
      scopeId: scopeId == null ? null : clean(scopeId, 128),
      createdAt: nowDate.toISOString(),
      expiresAt: new Date(nowDate.getTime() + ttlDays * 86400000).toISOString(),
    };
    this.records.push(record);
    const subjectRecords = this.records.filter((entry) => entry.subjectId === id);
    if (subjectRecords.length > this.maxRecordsPerSubject) {
      const remove = new Set(subjectRecords
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .slice(0, subjectRecords.length - this.maxRecordsPerSubject)
        .map((entry) => entry.id));
      this.records = this.records.filter((entry) => !remove.has(entry.id));
    }
    this.save();
    return { ...record };
  }

  retrieve(subjectId, query = '', topK = 4, now = new Date()) {
    const id = clean(subjectId, 128);
    const nowMs = new Date(now).getTime();
    return this.records
      .filter((record) => record.subjectId === id && Date.parse(record.expiresAt) > nowMs)
      .map((record) => ({ ...record, _score: query ? overlapScore(query, record.summary) : 0 }))
      .sort((a, b) => {
        if (query && b._score !== a._score) return b._score - a._score;
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      })
      .slice(0, Math.max(0, topK));
  }

  prune(now = new Date()) {
    const nowMs = new Date(now).getTime();
    const before = this.records.length;
    this.records = this.records.filter((record) => Date.parse(record.expiresAt) > nowMs);
    const changed = before - this.records.length;
    if (changed) this.save();
    return changed;
  }
}

module.exports = { EpisodicStore };
