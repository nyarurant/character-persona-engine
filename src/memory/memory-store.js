'use strict';

const crypto = require('node:crypto');
const { readJsonFile, writeJsonAtomic } = require('../state/atomic-json');
const { overlapScore } = require('../retrieval/lexical');

const SENSITIVE_PATTERNS = [
  /[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/u,
  /(?:password|passwd|pwd|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|bearer|private[-_ ]?key|client[-_ ]?secret|パスワード|トークン|APIキー|秘密鍵|認証情報)/iu,
  /(?:credit[-_ ]?card|カード番号|bank[-_ ]?account|銀行口座|口座番号|暗証番号|マイナンバー)/iu,
  /(?:address|住所|郵便番号|自宅|phone|telephone|電話番号|携帯番号)/iu,
  /(?:legal[-_ ]?name|real[-_ ]?name|本名)/iu,
  /(?:diagnos(?:is|ed)|medical[-_ ]?condition|medication|prescription|allerg(?:y|ies)|持病|診断|服薬|処方薬|アレルギー)/iu,
  /(?:sexual[-_ ]?(?:history|preference)|sex[-_ ]?life|性癖|性的嗜好|性生活)/iu,
  /(?:religion|religious belief|faith|宗教|信仰)/iu,
  /(?:political[-_ ]?(?:affiliation|ideology)|political party|支持政党|政治思想|政治的立場)/iu,
  /(?:race|ethnicity|ethnic origin|人種|民族)/iu,
  /(?:trade union|union membership|労働組合)/iu,
  /(?:criminal history|criminal record|犯罪歴|前科)/iu,
];

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu, '').trim();
}

function normalizeFact(value) {
  return clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function isSensitiveFact(value) {
  const text = clean(value);
  if (!text) return false;
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const phoneCandidates = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/gu) || [];
  return phoneCandidates.some((candidate) => candidate.replace(/\D/gu, '').length >= 10);
}

function iso(value, field) {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid date`);
  return date.toISOString();
}

class MemoryStore {
  constructor({ filePath, allowedCategories = ['identity', 'preference', 'boundary', 'relationship', 'ongoing', 'general'] } = {}) {
    if (!filePath) throw new TypeError('filePath is required');
    this.filePath = filePath;
    this.allowedCategories = new Set(allowedCategories);
    const parsed = readJsonFile(filePath, { version: 1, records: [] });
    this.records = Array.isArray(parsed.records) ? parsed.records : [];
  }

  save() {
    writeJsonAtomic(this.filePath, { version: 1, records: this.records });
  }

  remember(input, now = new Date()) {
    const subjectId = clean(input?.subjectId);
    const subjectName = clean(input?.subjectName);
    const fact = clean(input?.fact);
    const category = clean(input?.category || 'general').toLowerCase();
    if (!subjectId) throw new TypeError('subjectId is required');
    if (!fact) throw new TypeError('fact is required');
    if (!this.allowedCategories.has(category)) throw new TypeError(`unsupported memory category: ${category}`);
    if (isSensitiveFact(fact)) throw new Error('refusing to persist a sensitive-looking fact');
    const confidence = input?.confidence == null ? 0.8 : Number(input.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new TypeError('confidence must be between 0 and 1');
    const nowIso = new Date(now).toISOString();
    const key = normalizeFact(fact);
    let existing = this.records.find((record) =>
      record.status === 'active' && record.subjectId === subjectId && normalizeFact(record.fact) === key,
    );
    if (existing) {
      existing.subjectName = subjectName || existing.subjectName;
      existing.category = category;
      existing.confidence = Math.max(existing.confidence ?? 0, confidence);
      existing.updatedAt = nowIso;
      existing.expiresAt = iso(input?.expiresAt, 'expiresAt');
      existing.sourceMessageId = input?.sourceMessageId == null ? existing.sourceMessageId ?? null : clean(input.sourceMessageId);
      this.save();
      return { ...existing, deduplicated: true };
    }
    existing = {
      id: crypto.randomUUID(),
      subjectId,
      subjectName,
      fact,
      category,
      confidence,
      status: 'active',
      sourceMessageId: input?.sourceMessageId == null ? null : clean(input.sourceMessageId),
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt: iso(input?.expiresAt, 'expiresAt'),
    };
    this.records.push(existing);
    this.save();
    return { ...existing, deduplicated: false };
  }

  forget(subjectId, query, now = new Date()) {
    const id = clean(subjectId);
    const needle = normalizeFact(query);
    if (!id || !needle) return 0;
    let changed = 0;
    for (const record of this.records) {
      if (record.subjectId !== id || record.status !== 'active') continue;
      const factKey = normalizeFact(record.fact);
      if (!factKey.includes(needle) && !needle.includes(factKey)) continue;
      record.status = 'forgotten';
      record.updatedAt = new Date(now).toISOString();
      changed += 1;
    }
    if (changed) this.save();
    return changed;
  }

  retrieve(subjectId, query = '', topK = 4, now = new Date()) {
    const id = clean(subjectId);
    const nowMs = new Date(now).getTime();
    return this.records
      .filter((record) => {
        if (record.subjectId !== id || record.status !== 'active') return false;
        if (!record.expiresAt) return true;
        return Date.parse(record.expiresAt) > nowMs;
      })
      .map((record) => ({
        ...record,
        _score: query ? overlapScore(query, `${record.category} ${record.fact}`) : 0,
      }))
      .sort((a, b) => {
        if (query && b._score !== a._score) return b._score - a._score;
        if ((b.confidence ?? 0) !== (a.confidence ?? 0)) return (b.confidence ?? 0) - (a.confidence ?? 0);
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      })
      .slice(0, Math.max(0, topK));
  }
}

module.exports = { MemoryStore, normalizeFact, isSensitiveFact };
