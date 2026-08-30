'use strict';

const crypto = require('node:crypto');
const { readJsonFile, writeJsonAtomic } = require('../state/atomic-json');
const { overlapScore } = require('../retrieval/lexical');
const { isSensitiveFact } = require('../memory/memory-store');

function clean(value, max = 1000) {
  return String(value ?? '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu, '').replace(/\s+/gu, ' ').trim().slice(0, max);
}

function normalizeTags(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => clean(entry, 48).toLowerCase()).filter(Boolean))].slice(0, 12)
    : [];
}

function dateIso(value, field) {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid date`);
  return date.toISOString();
}

class EpisodeStore {
  constructor({ filePath, maxRecordsPerSubject = 250 } = {}) {
    if (!filePath) throw new TypeError('filePath is required');
    this.filePath = filePath;
    this.maxRecordsPerSubject = maxRecordsPerSubject;
    const parsed = readJsonFile(filePath, { version: 1, records: [] });
    this.records = Array.isArray(parsed.records) ? parsed.records : [];
  }

  save() {
    writeJsonAtomic(this.filePath, { version: 1, records: this.records });
  }

  add(input, now = new Date()) {
    const subjectId = clean(input?.subjectId, 128);
    const subjectName = clean(input?.subjectName, 128);
    const summary = clean(input?.summary, 700);
    const scopeId = clean(input?.scopeId, 128);
    if (!subjectId) throw new TypeError('subjectId is required');
    if (!summary) throw new TypeError('summary is required');
    if (isSensitiveFact(summary)) throw new Error('refusing to persist a sensitive-looking episode');

    const createdAt = new Date(now).toISOString();
    const expiresAt = input?.expiresAt == null ? null : dateIso(input.expiresAt, 'expiresAt');
    const tags = normalizeTags(input?.tags);
    const duplicate = this.records.find((record) =>
      record.status === 'active'
      && record.subjectId === subjectId
      && record.summary === summary
      && (!record.expiresAt || Date.parse(record.expiresAt) > Date.parse(createdAt)),
    );
    if (duplicate) {
      duplicate.updatedAt = createdAt;
      duplicate.tags = [...new Set([...(duplicate.tags || []), ...tags])].slice(0, 12);
      this.save();
      return { ...duplicate, deduplicated: true };
    }

    const record = {
      id: crypto.randomUUID(),
      subjectId,
      subjectName,
      summary,
      tags,
      scopeId: scopeId || null,
      sourceMessageIds: Array.isArray(input?.sourceMessageIds)
        ? input.sourceMessageIds.map((entry) => clean(entry, 128)).filter(Boolean).slice(0, 12)
        : [],
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      status: 'active',
    };
    this.records.push(record);
    this._enforceLimit(subjectId);
    this.save();
    return { ...record, deduplicated: false };
  }

  _enforceLimit(subjectId) {
    const active = this.records
      .filter((record) => record.subjectId === subjectId && record.status === 'active')
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    for (const record of active.slice(this.maxRecordsPerSubject)) record.status = 'pruned';
  }

  retrieve(subjectId, query = '', topK = 4, now = new Date()) {
    const id = clean(subjectId, 128);
    const nowMs = new Date(now).getTime();
    const needle = clean(query, 2000);
    return this.records
      .filter((record) => record.subjectId === id
        && record.status === 'active'
        && (!record.expiresAt || Date.parse(record.expiresAt) > nowMs))
      .map((record) => {
        const lexical = needle ? overlapScore(needle, `${record.tags?.join(' ') || ''} ${record.summary}`) : 0;
        const ageDays = Math.max(0, (nowMs - Date.parse(record.updatedAt)) / 86400000);
        const recency = 1 / (1 + ageDays / 30);
        return { ...record, _score: Number((lexical + 0.08 * recency).toFixed(4)) };
      })
      .sort((a, b) => b._score - a._score || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, Math.max(0, topK));
  }

  forgetSubject(subjectId, now = new Date()) {
    const id = clean(subjectId, 128);
    let changed = 0;
    for (const record of this.records) {
      if (record.subjectId === id && record.status === 'active') {
        record.status = 'forgotten';
        record.updatedAt = new Date(now).toISOString();
        changed += 1;
      }
    }
    if (changed) this.save();
    return changed;
  }
}

module.exports = { EpisodeStore };
