'use strict';

class RuntimeContext {
  constructor({ memoryStore = null, affinityStore = null, conversationStateStore = null, affinityNotes = {} } = {}) {
    this.memoryStore = memoryStore;
    this.affinityStore = affinityStore;
    this.conversationStateStore = conversationStateStore;
    this.affinityNotes = affinityNotes;
  }

  resolve({ speakerId, scopeId, query, memoryTopK = 4 } = {}) {
    const affinity = this.affinityStore && speakerId ? this.affinityStore.get(speakerId) : null;
    return {
      memories: this.memoryStore && speakerId ? this.memoryStore.retrieve(speakerId, query || '', memoryTopK) : [],
      temporaryState: this.conversationStateStore && scopeId ? this.conversationStateStore.get(scopeId) : null,
      affinity,
      relationshipNote: affinity ? this.affinityNotes[affinity.tier] || '' : '',
    };
  }
}

module.exports = { RuntimeContext };
