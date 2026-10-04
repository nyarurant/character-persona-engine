'use strict';

function cleanText(value, max = 4000) {
  return String(value ?? '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu, '').trim().slice(0, max);
}

class LocalConversationAdapter {
  constructor({
    engine,
    speaker = { id: 'local-user', name: 'プロキシ' },
    characterName = 'キャラクター',
    scopeId = 'local-conversation',
    maxHistoryMessages = 16,
    onReply = null,
  } = {}) {
    if (!engine || typeof engine.respond !== 'function') throw new TypeError('engine.respond is required');
    if (onReply != null && typeof onReply !== 'function') throw new TypeError('onReply must be a function');
    this.engine = engine;
    this.speaker = { id: cleanText(speaker.id, 128), name: cleanText(speaker.name || 'プロキシ', 128) };
    if (!this.speaker.id) throw new TypeError('speaker.id is required');
    this.scopeId = cleanText(scopeId, 128);
    if (!this.scopeId) throw new TypeError('scopeId is required');
    this.maxHistoryMessages = Math.max(2, Number(maxHistoryMessages) || 16);
    this.characterName = cleanText(characterName, 128) || 'キャラクター';
    this.onReply = onReply;
    this.messages = [];
    this.sequence = 0;
  }

  history() { return this.messages.map((entry) => ({ ...entry })); }

  reset() { this.messages = []; }

  async respond(value) {
    const message = cleanText(value);
    if (!message) throw new TypeError('message is required');
    this.sequence += 1;
    const history = this.history();
    const result = await this.engine.respond({
      message,
      messageId: `local-${Date.now()}-${this.sequence}`,
      speaker: { ...this.speaker },
      scopeId: this.scopeId,
      history,
      source: 'local-cli',
    });
    this.messages.push(
      { speakerId: this.speaker.id, speakerName: this.speaker.name, content: message },
      { speakerId: 'character', speakerName: this.characterName, content: result.text },
    );
    this.messages = this.messages.slice(-this.maxHistoryMessages);
    if (this.onReply) await this.onReply(result, { message, history });
    return result;
  }
}

module.exports = { LocalConversationAdapter };
