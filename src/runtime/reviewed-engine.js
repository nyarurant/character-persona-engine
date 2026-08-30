'use strict';

const { reviewMemoryTurn, applyMemoryDecision } = require('../memory/memory-reviewer');
const { reviewConversationTurn, applyConversationReview } = require('../review/conversation-reviewer');

class ReviewedCharacterEngine {
  constructor({
    engine,
    memoryStore = null,
    conversationStateStore = null,
    affinityStore = null,
    memoryProvider = null,
    conversationProvider = null,
    memoryReview = true,
    conversationReview = true,
    applyRepairs = true,
  } = {}) {
    if (!engine || typeof engine.respond !== 'function') throw new TypeError('engine.respond is required');
    this.engine = engine;
    this.memoryStore = memoryStore;
    this.conversationStateStore = conversationStateStore;
    this.affinityStore = affinityStore;
    this.memoryProvider = memoryProvider || engine.provider;
    this.conversationProvider = conversationProvider || engine.provider;
    this.memoryReview = memoryReview;
    this.conversationReview = conversationReview;
    this.applyRepairs = applyRepairs;
  }

  async respond(turn) {
    const result = await this.engine.respond(turn);
    const reviews = { memory: null, conversation: null };

    if (this.memoryReview && this.memoryStore && turn?.speaker?.id && this.memoryProvider) {
      try {
        const decision = await reviewMemoryTurn({
          provider: this.memoryProvider,
          message: turn.message,
          speaker: turn.speaker,
        });
        const applied = applyMemoryDecision(this.memoryStore, decision, {
          speaker: turn.speaker,
          messageId: turn.messageId,
        });
        reviews.memory = { decision, applied };
      } catch (error) {
        reviews.memory = { error: error.message };
      }
    }

    if (this.conversationReview && this.conversationStateStore && turn?.scopeId && this.conversationProvider) {
      try {
        const previousState = this.conversationStateStore.get(turn.scopeId);
        const review = await reviewConversationTurn({
          provider: this.conversationProvider,
          previousState,
          recentContext: turn.history,
          currentMessage: {
            id: turn.messageId || null,
            speaker: turn.speaker || null,
            content: turn.message,
          },
          botReply: result.text,
        });
        const applied = applyConversationReview(this.conversationStateStore, turn.scopeId, review);
        let affinity = null;
        if (this.affinityStore && turn?.speaker?.id && applied.affinityDelta) {
          affinity = this.affinityStore.adjust(turn.speaker.id, applied.affinityDelta);
        }
        reviews.conversation = { review, applied, affinity };
        if (this.applyRepairs && applied.repair?.action === 'EDIT' && applied.repair.replacement) {
          result.text = applied.repair.replacement;
        }
      } catch (error) {
        reviews.conversation = { error: error.message };
      }
    }

    return { ...result, reviews };
  }
}

module.exports = { ReviewedCharacterEngine };
