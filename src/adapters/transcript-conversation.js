'use strict';

function clean(value, max = 4000) {
  return String(value ?? '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu, '').trim().slice(0, max);
}

function timestampMs(value) {
  if (value == null) return Date.now();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError('timestamp must be a valid date or millisecond value');
  return parsed;
}

function normalizeConfidence(value) {
  if (value == null) return null;
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new TypeError('confidence must be a finite number between 0 and 1');
  }
  return confidence;
}

function normalizeTranscript(event) {
  if (!event || typeof event !== 'object') throw new TypeError('transcript event is required');
  const content = clean(event.text ?? event.content);
  const scopeId = clean(event.scopeId, 128);
  const speakerId = clean(event.speaker?.id, 128);
  const speakerName = clean(event.speaker?.name || 'speaker', 128);
  if (!content) throw new TypeError('transcript text is required');
  if (!scopeId) throw new TypeError('scopeId is required');
  if (!speakerId) throw new TypeError('speaker.id is required');
  return {
    id: event.messageId == null ? null : clean(event.messageId, 128),
    scopeId,
    speakerId,
    speakerName,
    content,
    timestamp: timestampMs(event.timestamp),
    direct: event.direct === true,
    confidence: normalizeConfidence(event.confidence),
  };
}

class TranscriptConversationAdapter {
  constructor({
    engine,
    activation = null,
    maxHistoryEntries = 100,
    contextWindowMs = 10 * 60 * 1000,
    onReply = null,
  } = {}) {
    if (!engine || typeof engine.respond !== 'function') throw new TypeError('engine.respond is required');
    if (activation != null && typeof activation !== 'function') throw new TypeError('activation must be a function');
    if (onReply != null && typeof onReply !== 'function') throw new TypeError('onReply must be a function');
    this.engine = engine;
    this.activation = activation || ((event) => event.direct === true);
    this.maxHistoryEntries = Math.max(1, Number(maxHistoryEntries) || 100);
    this.contextWindowMs = Math.max(1000, Number(contextWindowMs) || 10 * 60 * 1000);
    this.onReply = onReply;
    this.buffers = new Map();
  }

  _prune(scopeId, nowMs = Date.now()) {
    const key = String(scopeId);
    const cutoff = nowMs - this.contextWindowMs;
    const current = (this.buffers.get(key) || []).filter((entry) => entry.timestamp >= cutoff);
    const trimmed = current.slice(-this.maxHistoryEntries);
    if (trimmed.length) this.buffers.set(key, trimmed);
    else this.buffers.delete(key);
    return trimmed;
  }

  history(scopeId, now = Date.now()) {
    return this._prune(scopeId, timestampMs(now)).map((entry) => ({ ...entry }));
  }

  ingest(event) {
    const record = normalizeTranscript(event);
    const history = this._prune(record.scopeId, record.timestamp);
    history.push(record);
    this.buffers.set(record.scopeId, history.slice(-this.maxHistoryEntries));
    return { ...record };
  }

  async handleTranscript(event, { force = false } = {}) {
    const normalized = normalizeTranscript(event);
    const previous = this.history(normalized.scopeId, normalized.timestamp);
    const record = this.ingest(event);
    const shouldRespond = force || await this.activation(record, { history: previous.map((entry) => ({ ...entry })) });
    if (!shouldRespond) return { responded: false, transcript: record, result: null };

    const result = await this.engine.respond({
      message: record.content,
      messageId: record.id,
      speaker: { id: record.speakerId, name: record.speakerName },
      scopeId: record.scopeId,
      history: previous.map((entry) => ({
        speakerId: entry.speakerId,
        speakerName: entry.speakerName,
        content: entry.content,
        timestamp: entry.timestamp,
      })),
      source: 'voice-transcript',
      transcriptConfidence: record.confidence,
    });
    if (this.onReply) await this.onReply(result, record);
    return { responded: true, transcript: record, result };
  }
}

class VoiceSttBridge {
  constructor({ transcriber, transcriptAdapter } = {}) {
    if (!transcriber || typeof transcriber.transcribe !== 'function') throw new TypeError('transcriber.transcribe is required');
    if (!transcriptAdapter || typeof transcriptAdapter.handleTranscript !== 'function') {
      throw new TypeError('transcriptAdapter.handleTranscript is required');
    }
    this.transcriber = transcriber;
    this.transcriptAdapter = transcriptAdapter;
  }

  async handleAudio(input, { force = false } = {}) {
    if (!input || typeof input !== 'object') throw new TypeError('audio input is required');
    const result = await this.transcriber.transcribe(input);
    const text = clean(typeof result === 'string' ? result : result?.text);
    if (!text) return { responded: false, transcription: null, transcript: null, result: null };
    const confidence = normalizeConfidence(typeof result === 'object' && result != null ? result.confidence ?? null : null);
    const handled = await this.transcriptAdapter.handleTranscript({
      text,
      confidence,
      speaker: input.speaker,
      scopeId: input.scopeId,
      messageId: input.messageId,
      timestamp: input.timestamp,
      direct: input.direct,
    }, { force });
    return { ...handled, transcription: { text, confidence } };
  }
}

module.exports = { TranscriptConversationAdapter, VoiceSttBridge, normalizeTranscript, normalizeConfidence };
