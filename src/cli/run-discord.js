'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  loadCharacterPack,
  CharacterEngine,
  ReviewedCharacterEngine,
  RuntimeContext,
  ClaudeCliProvider,
  OllamaEmbedder,
  createVoiceHybridRetriever,
  createLoreHybridRetriever,
  PersistentEmbeddingIndex,
  createIndexedVoiceRetriever,
  createIndexedLoreRetriever,
  MemoryStore,
  EpisodeStore,
  AffinityStore,
  ConversationStateStore,
  DiscordBotAdapter,
  StyleBertVits2Client,
  DiscordVoiceConnector,
  DiscordVoiceOutput,
  DeferredReviewedCharacterEngine,
} = require('..');

function parseConfigPath(argv) {
  const explicit = argv.find((entry) => entry.startsWith('--config='));
  return explicit ? explicit.slice('--config='.length) : (process.env.CPE_CONFIG || './config.json');
}
function readConfig(filePath) {
  const absolute = path.resolve(filePath);
  const config = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!config.character) throw new Error(`${absolute}: character is required`);
  return { absolute, rootDir: path.dirname(absolute), config };
}
function resolveFrom(rootDir, value, fallback) { return path.resolve(rootDir, value || fallback); }
function readEnvValue(filePath, key) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = fs.readFileSync(filePath, 'utf8').match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.*?)\\s*$`, 'mu'));
  if (!match) return null;
  const value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function createCoreApplication(configInfo) {
  const { config, rootDir } = configInfo;
  const charactersDir = resolveFrom(rootDir, config.charactersDir, './characters');
  const pack = loadCharacterPack(charactersDir, config.character);
  const modelConfig = config.model || {};
  if (modelConfig.provider && modelConfig.provider !== 'claude-cli') throw new Error(`unsupported configured provider: ${modelConfig.provider}`);
  const provider = new ClaudeCliProvider({ bin: modelConfig.bin || 'claude', model: modelConfig.model || 'sonnet', timeoutMs: modelConfig.timeoutMs || 120000 });
  const runtime = config.runtime || {};
  const dataDir = resolveFrom(rootDir, runtime.dataDir, `./runtime-data/${pack.id}`);

  let voiceRetriever = null, loreRetriever = null, embeddingIndex = null;
  const retrieval = config.retrieval || {};
  if ((retrieval.mode || 'lexical') === 'hybrid') {
    const embedder = new OllamaEmbedder({ baseUrl: retrieval.ollamaUrl || 'http://127.0.0.1:11434', model: retrieval.embeddingModel || 'bge-m3', timeoutMs: retrieval.timeoutMs || 30000 });
    const commonOptions = { lexicalWeight: retrieval.lexicalWeight ?? 0.35, semanticWeight: retrieval.semanticWeight ?? 0.65, fallbackOnError: retrieval.fallbackOnError !== false };
    if (retrieval.persistentIndex !== false) {
      embeddingIndex = new PersistentEmbeddingIndex({ filePath: resolveFrom(rootDir, retrieval.indexFile, path.join(dataDir, 'embeddings.json')), embedder, batchSize: retrieval.embeddingBatchSize ?? 64 });
      voiceRetriever = createIndexedVoiceRetriever({ index: embeddingIndex, ...commonOptions });
      loreRetriever = createIndexedLoreRetriever({ index: embeddingIndex, ...commonOptions });
    } else {
      voiceRetriever = createVoiceHybridRetriever({ embedder, ...commonOptions });
      loreRetriever = createLoreHybridRetriever({ embedder, ...commonOptions });
    }
  } else if (retrieval.mode && retrieval.mode !== 'lexical') throw new Error(`unsupported retrieval mode: ${retrieval.mode}`);

  const memoryStore = new MemoryStore({ filePath: path.join(dataDir, 'memory.json') });
  const episodeStore = new EpisodeStore({ filePath: path.join(dataDir, 'episodes.json'), maxRecordsPerSubject: runtime.maxEpisodeRecordsPerSubject ?? 250 });
  const affinityStore = new AffinityStore({ filePath: path.join(dataDir, 'affinity.json'), favorableThreshold: runtime.favorableThreshold ?? 8, closeThreshold: runtime.closeThreshold ?? 25 });
  const conversationStateStore = new ConversationStateStore({ filePath: path.join(dataDir, 'conversation.json'), ttlMs: runtime.conversationStateTtlMs ?? 30 * 60 * 1000 });
  const runtimeContext = new RuntimeContext({
    memoryStore,
    episodeStore,
    affinityStore,
    conversationStateStore,
    userProfiles: runtime.userProfiles || {},
    affinityNotes: {
      favorable: runtime.favorableRelationshipNote || 'You know this person reasonably well and can be more relaxed.',
      close: runtime.closeRelationshipNote || 'This is an established close relationship; comfortable banter is natural.',
    },
  });

  const coreEngine = new CharacterEngine({ pack, provider, runtimeContext, voiceRetriever, loreRetriever, voiceTopK: retrieval.voiceTopK ?? 6, loreTopK: retrieval.loreTopK ?? 6 });
  const engine = new ReviewedCharacterEngine({ engine: coreEngine, memoryStore, episodeStore, conversationStateStore, affinityStore, memoryReview: runtime.memoryReview !== false, conversationReview: runtime.conversationReview !== false, applyRepairs: runtime.applyRepairs !== false });

  return { pack, provider, coreEngine, engine, embeddingIndex, stores: { memoryStore, episodeStore, affinityStore, conversationStateStore } };
}

function createApplication(configInfo) {
  const core = createCoreApplication(configInfo);
  const { config, rootDir } = configInfo;
  const discord = config.discord || {};
  const allowedChannelIds = discord.allowedChannelIds || [], allowedGuildIds = discord.allowedGuildIds || [];
  if (discord.allowAll !== true && allowedChannelIds.length === 0 && allowedGuildIds.length === 0) throw new Error('discord.allowedChannelIds or discord.allowedGuildIds is required unless discord.allowAll is true');
  const tokenEnv = discord.tokenEnv || 'DISCORD_BOT_TOKEN';
  const tokenFile = discord.tokenEnvFile ? resolveFrom(configInfo.rootDir, discord.tokenEnvFile) : null;
  const token = process.env[tokenEnv] || readEnvValue(tokenFile, tokenEnv);
  if (!token) throw new Error(`${tokenEnv} is not set`);
  const reviewMode = discord.reviewMode || 'background';
  let discordEngine;
  if (reviewMode === 'background') discordEngine = new DeferredReviewedCharacterEngine({ reviewedEngine: core.engine, onReviewError: (error) => console.error('[discord-review]', error) });
  else if (reviewMode === 'blocking') discordEngine = core.engine;
  else if (reviewMode === 'off') discordEngine = core.coreEngine;
  else throw new Error(`unsupported discord.reviewMode: ${reviewMode}`);
  const voiceConfig = discord.voiceOutput || {};
  let voiceOutput = null;
  if (voiceConfig.enabled === true) {
    const tts = new StyleBertVits2Client({
      baseUrl: voiceConfig.baseUrl || 'http://127.0.0.1:5000',
      timeoutMs: voiceConfig.timeoutMs || 60000,
      outputDir: resolveFrom(rootDir, voiceConfig.outputDir, './runtime-data/discord-voice'),
      defaults: voiceConfig.parameters || {},
      play: false,
    });
    const connector = new DiscordVoiceConnector({
      ffmpegBin: voiceConfig.ffmpegBin || 'ffmpeg.exe',
      connectTimeoutMs: voiceConfig.connectTimeoutMs || 20000,
      playbackTimeoutMs: voiceConfig.playbackTimeoutMs || 120000,
    });
    voiceOutput = new DiscordVoiceOutput({ tts, connector, keepWavFiles: voiceConfig.keepWavFiles === true });
  }
  const adapter = new DiscordBotAdapter({
    engine: discordEngine,
    token,
    allowedChannelIds,
    allowedGuildIds,
    followUpWindowMs: discord.followUpWindowMs ?? 180000,
    maxHistoryMessages: discord.maxHistoryMessages ?? 15,
    onReply: voiceOutput ? (result, message) => voiceOutput.handleReply(result, message) : null,
  });
  return { ...core, adapter, voiceOutput, discordEngine, reviewMode };
}

async function main() {
  const info = readConfig(parseConfigPath(process.argv.slice(2)));
  if (process.argv.includes('--low-memory')) info.config.retrieval = { ...(info.config.retrieval || {}), mode: 'lexical' };
  const app = createApplication(info);
  await app.adapter.start();
  console.log(`character-persona-engine: ${app.pack.displayName} connected`);
  const shutdown = async () => { app.voiceOutput?.stop(); await app.adapter.stop(); process.exit(0); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error.message || error); process.exit(1); });
module.exports = { parseConfigPath, readConfig, readEnvValue, createCoreApplication, createApplication };
