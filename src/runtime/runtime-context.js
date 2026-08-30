'use strict';

function resolveUserProfile(userProfiles, speakerId) {
  if (!speakerId || !userProfiles) return { found: false, value: null };
  if (userProfiles instanceof Map) {
    return userProfiles.has(String(speakerId))
      ? { found: true, value: userProfiles.get(String(speakerId)) }
      : { found: false, value: null };
  }
  if (typeof userProfiles === 'object' && Object.prototype.hasOwnProperty.call(userProfiles, String(speakerId))) {
    return { found: true, value: userProfiles[String(speakerId)] };
  }
  return { found: false, value: null };
}

function relationshipFromProfile(profile) {
  if (typeof profile === 'string') return profile;
  if (profile && typeof profile === 'object' && profile.relationshipNote != null) return String(profile.relationshipNote);
  return null;
}

class RuntimeContext {
  constructor({
    memoryStore = null,
    episodeStore = null,
    affinityStore = null,
    conversationStateStore = null,
    affinityNotes = {},
    userProfiles = {},
  } = {}) {
    this.memoryStore = memoryStore;
    this.episodeStore = episodeStore;
    this.affinityStore = affinityStore;
    this.conversationStateStore = conversationStateStore;
    this.affinityNotes = affinityNotes;
    this.userProfiles = userProfiles;
  }

  resolve({ speakerId, scopeId, query, memoryTopK = 4, episodeTopK = 4 } = {}) {
    const affinity = this.affinityStore && speakerId ? this.affinityStore.get(speakerId) : null;
    const profile = resolveUserProfile(this.userProfiles, speakerId);
    const profileNote = profile.found ? relationshipFromProfile(profile.value) : null;
    const relationshipNote = profileNote != null
      ? profileNote
      : (affinity ? this.affinityNotes[affinity.tier] || '' : '');
    return {
      memories: this.memoryStore && speakerId ? this.memoryStore.retrieve(speakerId, query || '', memoryTopK) : [],
      episodes: this.episodeStore && speakerId ? this.episodeStore.retrieve(speakerId, query || '', episodeTopK) : [],
      temporaryState: this.conversationStateStore && scopeId ? this.conversationStateStore.get(scopeId) : null,
      affinity,
      userProfile: profile.found ? profile.value : null,
      relationshipNote,
    };
  }
}

module.exports = { RuntimeContext, resolveUserProfile, relationshipFromProfile };
