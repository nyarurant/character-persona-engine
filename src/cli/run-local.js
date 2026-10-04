'use strict';

const path = require('node:path');
const readline = require('node:readline');
const { DeferredReviewedCharacterEngine, LocalConversationAdapter, StyleBertVits2Client } = require('..');
const { parseConfigPath, readConfig, createCoreApplication } = require('./run-discord');

function parseArgs(argv) {
  const onceEntry = argv.find((entry) => entry.startsWith('--once='));
  return {
    configPath: parseConfigPath(argv),
    textOnly: argv.includes('--text-only'),
    lowMemory: argv.includes('--low-memory') || argv.includes('--lexical'),
    once: onceEntry ? onceEntry.slice('--once='.length) : null,
  };
}

function createLocalApplication(configInfo, options = {}) {
  const config = structuredClone(configInfo.config);
  if (options.lowMemory) config.retrieval = { ...(config.retrieval || {}), mode: 'lexical' };
  const info = { ...configInfo, config };
  const core = createCoreApplication(info);
  const local = config.local || {};
  const reviewMode = local.reviewMode || 'background';
  let conversationEngine;
  if (reviewMode === 'background') {
    conversationEngine = new DeferredReviewedCharacterEngine({
      reviewedEngine: core.engine,
      onReviewError: (error) => console.error(`background review failed: ${error.message}`),
    });
  } else if (reviewMode === 'blocking') conversationEngine = core.engine;
  else if (reviewMode === 'off') conversationEngine = core.coreEngine;
  else throw new Error(`unsupported local.reviewMode: ${reviewMode}`);
  const voiceConfig = local.voice || {};
  const voiceEnabled = options.textOnly !== true && voiceConfig.enabled !== false;
  const tts = voiceEnabled ? new StyleBertVits2Client({
    baseUrl: voiceConfig.baseUrl || 'http://127.0.0.1:5000',
    timeoutMs: voiceConfig.timeoutMs || 60000,
    outputDir: path.resolve(configInfo.rootDir, voiceConfig.outputDir || './runtime-data/voice-output'),
    defaults: voiceConfig.parameters || {},
    play: voiceConfig.play !== false,
  }) : null;
  const conversation = new LocalConversationAdapter({
    engine: conversationEngine,
    speaker: local.speaker || { id: 'local-owner', name: 'プロキシ' },
    characterName: core.pack.displayName,
    scopeId: local.scopeId || `local-${core.pack.id}`,
    maxHistoryMessages: local.maxHistoryMessages || 16,
  });
  return { ...core, config, conversation, conversationEngine, tts, voiceEnabled, reviewMode };
}

async function answer(app, state, text) {
  process.stdout.write('考え中…\n');
  const result = await app.conversation.respond(text);
  console.log(`${app.pack.displayName}> ${result.text}`);
  if (state.voice && app.tts) {
    try {
      await app.tts.speak(result.text);
    } catch (error) {
      state.voice = false;
      console.error(`音声だけ失敗: ${error.message}`);
      console.error('TTSを起動して /voice on、または文字だけで続行できる');
    }
  }
  return result;
}

async function runInteractive(app) {
  const state = { voice: app.voiceEnabled };
  if (state.voice) await app.tts.health();
  console.log(`${app.pack.displayName} ローカル会話  voice=${state.voice ? 'on' : 'off'}`);
  console.log('/voice on|off  /reset  /quit');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'あなた> ' });
  let busy = false;
  rl.prompt();
  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) { rl.prompt(); return; }
    if (text === '/quit' || text === '/exit') { rl.close(); return; }
    if (text === '/reset') { app.conversation.reset(); console.log('この会話の履歴をリセットした'); rl.prompt(); return; }
    if (text === '/voice off') { state.voice = false; console.log('voice=off'); rl.prompt(); return; }
    if (text === '/voice on') {
      if (!app.tts) { console.log('この起動は --text-only なので、音声ありで起動し直して'); rl.prompt(); return; }
      try { await app.tts.health(); state.voice = true; console.log('voice=on'); }
      catch (error) { console.error(error.message); }
      rl.prompt();
      return;
    }
    if (busy) { console.log('まだ返答中'); rl.prompt(); return; }
    busy = true;
    rl.pause();
    try { await answer(app, state, text); }
    catch (error) { console.error(`失敗: ${error.message}`); }
    finally { busy = false; rl.resume(); rl.prompt(); }
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const info = readConfig(options.configPath);
  const app = createLocalApplication(info, options);
  const state = { voice: app.voiceEnabled };
  if (options.once != null) {
    if (state.voice) await app.tts.health();
    await answer(app, state, options.once);
    return;
  }
  await runInteractive(app);
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message || error); process.exit(1); });
module.exports = { parseArgs, createLocalApplication, answer };
