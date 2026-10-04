'use strict';

class DeferredReviewedCharacterEngine {
  constructor({ reviewedEngine, onReviewError = null } = {}) {
    if (!reviewedEngine || typeof reviewedEngine.review !== 'function' || !reviewedEngine.engine) {
      throw new TypeError('reviewedEngine with review() and engine is required');
    }
    if (onReviewError != null && typeof onReviewError !== 'function') throw new TypeError('onReviewError must be a function');
    this.reviewedEngine = reviewedEngine;
    this.engine = reviewedEngine.engine;
    this.provider = this.engine.provider;
    this.onReviewError = onReviewError;
    this.pending = new Set();
  }

  async respond(turn) {
    const result = await this.engine.respond(turn);
    const reviewResult = { ...result };
    const pending = this.reviewedEngine.review(turn, reviewResult)
      .catch((error) => {
        if (this.onReviewError) this.onReviewError(error);
        return { ...reviewResult, reviews: { error: error.message } };
      })
      .finally(() => this.pending.delete(pending));
    this.pending.add(pending);
    return { ...result, reviews: { deferred: true } };
  }

  async drain() { return Promise.allSettled([...this.pending]); }
}

module.exports = { DeferredReviewedCharacterEngine };
