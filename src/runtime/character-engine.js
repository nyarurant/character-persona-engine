'use strict';

const { retrieveVoice, retrieveLore } = require('../retrieval/lexical');
const { buildSystemPrompt, buildUserPrompt } = require('../context/prompt-builder');

class CharacterEngine {
  constructor({ pack, provider, voiceTopK = 6, loreTopK = 6 } = {}) {
    if (!pack) throw new TypeError('pack is required');
    if (!provider || typeof provider.generate !== 'function') throw new TypeError('provider.generate is required');
    this.pack = pack;
    this.provider = provider;
    this.voiceTopK = voiceTopK;
    this.loreTopK = loreTopK;
  }

  async respond(turn) {
    if (!turn || typeof turn.message !== 'string') throw new TypeError('turn.message must be a string');
    const query = [turn.message, ...(turn.history || []).slice(-3).map((x) => x.content || '')].join(' ');
    const retrievedVoice = turn.retrievedVoice || retrieveVoice(this.pack.examples, query, this.voiceTopK);
    const retrievedLore = turn.retrievedLore || retrieveLore(this.pack.lore, query, this.loreTopK);
    const systemPrompt = buildSystemPrompt(this.pack, {
      retrievedVoice,
      retrievedLore,
      relationshipNote: turn.relationshipNote,
      memories: turn.memories,
      temporaryState: turn.temporaryState,
    });
    const userPrompt = buildUserPrompt(turn);
    const result = await this.provider.generate({
      characterId: this.pack.id,
      systemPrompt,
      userPrompt,
      turn,
    });
    const text = typeof result === 'string' ? result : result?.text;
    if (typeof text !== 'string') throw new Error('provider.generate must return a string or { text }');
    return {
      text: text.trim(),
      retrievedVoice,
      retrievedLore,
      usage: result?.usage ?? null,
    };
  }
}

module.exports = { CharacterEngine };
