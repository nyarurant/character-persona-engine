'use strict';

const { loadCharacterPack } = require('./character/character-pack');
const { CharacterEngine } = require('./runtime/character-engine');
const { ReviewedCharacterEngine } = require('./runtime/reviewed-engine');
const { RuntimeContext } = require('./runtime/runtime-context');
const { ClaudeCliProvider } = require('./providers/claude-cli');
const { retrieveVoice, retrieveLore } = require('./retrieval/lexical');
const { PersistentEmbeddingCache } = require('./retrieval/embedding-cache');
const {
  OllamaEmbedder,
  HybridRetriever,
  createVoiceHybridRetriever,
  createLoreHybridRetriever,
} = require('./retrieval/hybrid');
const { buildSystemPrompt, buildUserPrompt } = require('./context/prompt-builder');
const { buildPersonaFromCorpus } = require('./build/persona-builder');
const { MemoryStore } = require('./memory/memory-store');
const { EpisodicStore } = require('./memory/episodic-store');
const {
  parseMemoryDecision,
  reviewMemoryTurn,
  applyMemoryDecision,
} = require('./memory/memory-reviewer');
const { AffinityStore } = require('./state/affinity-store');
const { ConversationStateStore } = require('./state/conversation-state');
const {
  parseConversationReview,
  reviewConversationTurn,
  applyConversationReview,
} = require('./review/conversation-reviewer');
const { DiscordBotAdapter } = require('./adapters/discord-bot');

module.exports = {
  loadCharacterPack,
  CharacterEngine,
  ReviewedCharacterEngine,
  RuntimeContext,
  ClaudeCliProvider,
  retrieveVoice,
  retrieveLore,
  PersistentEmbeddingCache,
  OllamaEmbedder,
  HybridRetriever,
  createVoiceHybridRetriever,
  createLoreHybridRetriever,
  buildSystemPrompt,
  buildUserPrompt,
  buildPersonaFromCorpus,
  MemoryStore,
  EpisodicStore,
  parseMemoryDecision,
  reviewMemoryTurn,
  applyMemoryDecision,
  AffinityStore,
  ConversationStateStore,
  parseConversationReview,
  reviewConversationTurn,
  applyConversationReview,
  DiscordBotAdapter,
};
