'use strict';

class RuntimeContext {
  constructor({
    memoryStore = null,
    episodicStore = null,
    affinityStore = null,
    conversationStateStore = null,
    affinityNotes = {},
    userProfiles = {},
    defaultUserProfile = '',
  } = {}) {
    this.memoryStore = memoryStore;
    this.episodicStore = episodicStore;
    this.affinityStore = affinityStore;
    this.conversationStateStore = conversationStateStore;
    this.affinityNotes = affinityNotes;
    this.userProfiles = userProfiles || {};
    this.defaultUserProfile = defaultUserProfile || '';
  }

  resolve({ speakerId, scopeId, query, memoryTopK = 4, episodeTopK = 4 } = {}) {
    const id = speakerId == null ? null : String(speakerId);
    const affinity = this.affinityStore && id ? this.affinityStore.get(id) : null;
    const explicitProfile = id && Object.prototype.hasOwnProperty.call(this.userProfiles, id)
      ? String(this.userProfiles[id] || '')
      : null;
    const affinityNote = affinity ? this.affinityNotes[affinity.tier] || '' : '';
    return {
      memories: this.memoryStore && id ? this.memoryStore.retrieve(id, query || '', memoryTopK) : [],
      episodes: this.episodicStore && id ? this.episodicStore.retrieve(id, query || '', episodeTopK) : [],
      temporaryState: this.conversationStateStore && scopeId ? this.conversationStateStore.get(scopeId) : null,
      affinity,
      relationshipNote: explicitProfile ?? affinityNote ?? this.defaultUserProfile,
      relationshipSource: explicitProfile != null ? 'profile' : (affinityNote ? 'affinity' : 'default'),
    };
  }
}

module.exports = { RuntimeContext };
