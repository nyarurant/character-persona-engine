'use strict';

const { loadCharacterPack, validateExampleRecord, validateLoreRecord } = require('./character/character-pack');
const { CURRENT_CHARACTER_SCHEMA_VERSION, migrateCharacterDefinition } = require('./character/schema');
const { CharacterEngine } = require('./runtime/character-engine');
const { ReviewedCharacterEngine } = require('./runtime/reviewed-engine');
const { RuntimeContext } = require('./runtime/runtime-context');
const { ClaudeCliProvider } = require('./providers/claude-cli');
const { retrieveVoice, retrieveLore } = require('./retrieval/lexical');
const { OllamaEmbedder, HybridRetriever, createVoiceHybridRetriever, createLoreHybridRetriever } = require('./retrieval/hybrid');
const { PersistentEmbeddingIndex, createIndexedVoiceRetriever, createIndexedLoreRetriever } = require('./retrieval/persistent-index');
const { buildSystemPrompt, buildUserPrompt } = require('./context/prompt-builder');
const { buildPersonaFromCorpus } = require('./build/persona-builder');
const { MemoryStore } = require('./memory/memory-store');
const { EpisodeStore } = require('./recall/episode-store');
const { parseMemoryDecision, reviewMemoryTurn, applyMemoryDecision } = require('./memory/memory-reviewer');
const { AffinityStore } = require('./state/affinity-store');
const { ConversationStateStore } = require('./state/conversation-state');
const { parseConversationReview, reviewConversationTurn, applyConversationReview } = require('./review/conversation-reviewer');
const { DiscordBotAdapter } = require('./adapters/discord-bot');
const { TranscriptConversationAdapter, VoiceSttBridge, normalizeTranscript } = require('./adapters/transcript-conversation');

module.exports = {
  loadCharacterPack, validateExampleRecord, validateLoreRecord,
  CURRENT_CHARACTER_SCHEMA_VERSION, migrateCharacterDefinition,
  CharacterEngine, ReviewedCharacterEngine, RuntimeContext, ClaudeCliProvider,
  retrieveVoice, retrieveLore, OllamaEmbedder, HybridRetriever, createVoiceHybridRetriever, createLoreHybridRetriever,
  PersistentEmbeddingIndex, createIndexedVoiceRetriever, createIndexedLoreRetriever,
  buildSystemPrompt, buildUserPrompt, buildPersonaFromCorpus,
  MemoryStore, EpisodeStore, parseMemoryDecision, reviewMemoryTurn, applyMemoryDecision,
  AffinityStore, ConversationStateStore,
  parseConversationReview, reviewConversationTurn, applyConversationReview,
  DiscordBotAdapter, TranscriptConversationAdapter, VoiceSttBridge, normalizeTranscript,
};
