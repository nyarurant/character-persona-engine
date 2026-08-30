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
  MemoryStore,
  AffinityStore,
  ConversationStateStore,
  DiscordBotAdapter,
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

function resolveFrom(rootDir, value, fallback) {
  return path.resolve(rootDir, value || fallback);
}

function createApplication(configInfo) {
  const { config, rootDir } = configInfo;
  const charactersDir = resolveFrom(rootDir, config.charactersDir, './characters');
  const pack = loadCharacterPack(charactersDir, config.character);
  const modelConfig = config.model || {};
  if (modelConfig.provider && modelConfig.provider !== 'claude-cli') {
    throw new Error(`unsupported configured provider: ${modelConfig.provider}`);
  }
  const provider = new ClaudeCliProvider({
    bin: modelConfig.bin || 'claude',
    model: modelConfig.model || 'sonnet',
    timeoutMs: modelConfig.timeoutMs || 120000,
  });

  let voiceRetriever = null;
  let loreRetriever = null;
  const retrieval = config.retrieval || {};
  if ((retrieval.mode || 'lexical') === 'hybrid') {
    const embedder = new OllamaEmbedder({
      baseUrl: retrieval.ollamaUrl || 'http://127.0.0.1:11434',
      model: retrieval.embeddingModel || 'bge-m3',
      timeoutMs: retrieval.timeoutMs || 30000,
    });
    voiceRetriever = createVoiceHybridRetriever({
      embedder,
      lexicalWeight: retrieval.lexicalWeight ?? 0.35,
      semanticWeight: retrieval.semanticWeight ?? 0.65,
      fallbackOnError: retrieval.fallbackOnError !== false,
    });
    loreRetriever = createLoreHybridRetriever({
      embedder,
      lexicalWeight: retrieval.lexicalWeight ?? 0.35,
      semanticWeight: retrieval.semanticWeight ?? 0.65,
      fallbackOnError: retrieval.fallbackOnError !== false,
    });
  } else if (retrieval.mode && retrieval.mode !== 'lexical') {
    throw new Error(`unsupported retrieval mode: ${retrieval.mode}`);
  }

  const runtime = config.runtime || {};
  const dataDir = resolveFrom(rootDir, runtime.dataDir, `./runtime-data/${pack.id}`);
  const memoryStore = new MemoryStore({ filePath: path.join(dataDir, 'memory.json') });
  const affinityStore = new AffinityStore({
    filePath: path.join(dataDir, 'affinity.json'),
    favorableThreshold: runtime.favorableThreshold ?? 8,
    closeThreshold: runtime.closeThreshold ?? 25,
  });
  const conversationStateStore = new ConversationStateStore({
    filePath: path.join(dataDir, 'conversation.json'),
    ttlMs: runtime.conversationStateTtlMs ?? 30 * 60 * 1000,
  });
  const runtimeContext = new RuntimeContext({
    memoryStore,
    affinityStore,
    conversationStateStore,
    affinityNotes: {
      favorable: runtime.favorableRelationshipNote || 'You know this person reasonably well and can be more relaxed.',
      close: runtime.closeRelationshipNote || 'This is an established close relationship; comfortable banter is natural.',
    },
  });

  const coreEngine = new CharacterEngine({
    pack,
    provider,
    runtimeContext,
    voiceRetriever,
    loreRetriever,
    voiceTopK: retrieval.voiceTopK ?? 6,
    loreTopK: retrieval.loreTopK ?? 6,
  });
  const engine = new ReviewedCharacterEngine({
    engine: coreEngine,
    memoryStore,
    conversationStateStore,
    affinityStore,
    memoryReview: runtime.memoryReview !== false,
    conversationReview: runtime.conversationReview !== false,
    applyRepairs: runtime.applyRepairs !== false,
  });

  const discord = config.discord || {};
  const allowedChannelIds = discord.allowedChannelIds || [];
  const allowedGuildIds = discord.allowedGuildIds || [];
  if (discord.allowAll !== true && allowedChannelIds.length === 0 && allowedGuildIds.length === 0) {
    throw new Error('discord.allowedChannelIds or discord.allowedGuildIds is required unless discord.allowAll is true');
  }
  const tokenEnv = discord.tokenEnv || 'DISCORD_BOT_TOKEN';
  const token = process.env[tokenEnv];
  if (!token) throw new Error(`${tokenEnv} is not set`);
  const adapter = new DiscordBotAdapter({
    engine,
    token,
    allowedChannelIds,
    allowedGuildIds,
    followUpWindowMs: discord.followUpWindowMs ?? 180000,
    maxHistoryMessages: discord.maxHistoryMessages ?? 15,
  });

  return { pack, provider, engine, adapter, stores: { memoryStore, affinityStore, conversationStateStore } };
}

async function main() {
  const info = readConfig(parseConfigPath(process.argv.slice(2)));
  const app = createApplication(info);
  await app.adapter.start();
  console.log(`character-persona-engine: ${app.pack.displayName} connected`);
  const shutdown = async () => {
    await app.adapter.stop();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

module.exports = { parseConfigPath, readConfig, createApplication };
