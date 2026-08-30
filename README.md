# Character Persona Engine

A reusable Node.js engine for long-running character/persona chatbots.

The project deliberately separates data that roleplay bots often mix together:

- **Identity / persona** — who the character is and how they behave.
- **Voice examples** — how the character actually speaks in context.
- **Lore** — canonical/reference facts about the character and world.
- **User memory** — durable facts learned about each conversation partner.
- **Runtime state** — affinity and short-lived conversation state.

Character-specific behavior lives in a Character Pack under `characters/<id>/`. The engine itself contains no hard-coded character identity.

## Implemented

- Character Pack loading + validation
- provider-neutral `CharacterEngine`
- Claude CLI provider adapter
- separate Voice and Lore retrieval domains
- lexical retrieval
- pluggable retriever interface
- Ollama `/api/embed` adapter (`bge-m3` by default)
- semantic + lexical `HybridRetriever` with lexical fallback
- persistent `MemoryStore` with sensitive-data guard and expiry
- persistent `AffinityStore`
- TTL-based `ConversationStateStore`
- AI memory decision reviewer
- AI conversation-state reviewer
- minimal contextual self-repair
- affinity delta review without an extra reviewer call
- `ReviewedCharacterEngine` orchestration
- official Discord bot adapter with direct/follow-up handling
- config-driven Discord runner
- corpus -> `examples.jsonl` + `persona.md` builder
- sample Character Pack and Node test suite

## Quick start

Requirements: Node.js 20+, and Claude CLI for the included provider. Hybrid retrieval additionally expects Ollama with an embedding model such as `bge-m3`.

```bash
npm install
npm test
npm run validate-pack -- sample-character
```

### Run on Discord

Copy the example config, set at least one `discord.allowedChannelIds` or `discord.allowedGuildIds`, and set your official Discord bot token in the environment. The runner refuses to start with an empty scope unless you explicitly set `discord.allowAll` to `true`.

```bash
cp config.example.json config.json
export DISCORD_BOT_TOKEN='...'
npm run start:discord
```

On Windows PowerShell:

```powershell
Copy-Item config.example.json config.json
$env:DISCORD_BOT_TOKEN = '...'
npm run start:discord
```

The runner loads the Character Pack named by `config.json`, creates per-character runtime stores, optionally enables Ollama hybrid retrieval, and connects an official Discord bot account. Normal user-account automation is not part of this project.

Use another config file with:

```bash
npm run start:discord -- --config=./my-character.json
```

## Build a Character Pack from dialogue

Build voice examples only:

```bash
npm run build-persona -- --character=my-character --corpus=data/dialogue.jsonl --examples-only
```

Generate both `examples.jsonl` and `persona.md` with Claude CLI:

```bash
npm run build-persona -- --character=my-character --corpus=data/dialogue.jsonl --model=sonnet
```

Canonical facts belong in `lore.jsonl`; the persona builder intentionally analyzes dialogue for voice/behavior rather than treating every scene line as permanent lore.

## Character Pack

```text
characters/my-character/
├─ character.json   # stable identity + generation defaults
├─ persona.md       # nuanced personality/behavior profile
├─ rules.md         # hard character-specific RP rules
├─ examples.jsonl   # contextual voice examples
└─ lore.jsonl       # canonical/reference facts, separate from voice
```

See [`docs/character-pack.md`](docs/character-pack.md) and [`docs/building-a-character.md`](docs/building-a-character.md).

## Programmatic use

```js
const path = require('node:path');
const {
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
  loadCharacterPack,
} = require('./src');

const pack = loadCharacterPack(path.join(__dirname, 'characters'), 'sample-character');
const provider = new ClaudeCliProvider({ model: 'sonnet' });
const embedder = new OllamaEmbedder({ model: 'bge-m3' });

const memoryStore = new MemoryStore({ filePath: './runtime-data/memory.json' });
const affinityStore = new AffinityStore({ filePath: './runtime-data/affinity.json' });
const conversationStateStore = new ConversationStateStore({ filePath: './runtime-data/conversation.json' });

const runtimeContext = new RuntimeContext({
  memoryStore,
  affinityStore,
  conversationStateStore,
});

const core = new CharacterEngine({
  pack,
  provider,
  runtimeContext,
  voiceRetriever: createVoiceHybridRetriever({ embedder }),
  loreRetriever: createLoreHybridRetriever({ embedder }),
});

const engine = new ReviewedCharacterEngine({
  engine: core,
  memoryStore,
  affinityStore,
  conversationStateStore,
});

const result = await engine.respond({
  message: '眠い',
  messageId: 'message-1',
  speaker: { id: 'user-1', name: 'user' },
  scopeId: 'channel-123',
});
```

## Design rules

Voice is **not** Lore. Lore is **not** user Memory. Memory is **not** temporary Conversation State. A dramatic line from one scene should not become a permanent factual belief, and a conversation partner's learned preference should never mutate the canonical Character Pack.

The durable-memory layer rejects sensitive-looking facts such as credentials, contact/address information, legal names, health/sexual information, political or religious affiliation, race/ethnicity, union membership, criminal history, and financial identifiers.

The core runtime remains provider-neutral. Claude CLI, Discord and Ollama are adapters around the engine rather than assumptions inside the character model.

## Remaining parity work

- richer per-person episodic recall beyond durable memory
- embedding index persistence / incremental rebuild for very large Character Packs
- optional voice/STT adapter
- Character Pack schema migration/version tooling

## License

MIT
