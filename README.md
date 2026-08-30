# Character Persona Engine

A reusable Node.js engine for long-running character/persona chatbots.

The project separates four things that are often mixed together in roleplay bots:

- **Identity / persona** — who the character is and how they behave.
- **Voice examples** — how the character actually speaks in context.
- **Lore** — facts the character knows about their world.
- **Runtime state** — relationship/affinity, durable user memories, and temporary conversation state.

Character-specific behavior lives in a Character Pack under `characters/<id>/`. The engine itself does not contain a hard-coded character identity.

## Implemented

- Character Pack loading + validation
- provider-neutral `CharacterEngine`
- Claude CLI provider
- separate Voice and Lore retrieval
- relationship, memory, and temporary-state prompt composition
- persistent `MemoryStore`
- persistent `AffinityStore`
- TTL-based `ConversationStateStore`
- `RuntimeContext` automatic state injection
- dialogue corpus cleaning/statistics/sampling
- corpus -> `examples.jsonl` + `persona.md` builder
- sample Character Pack and Node test suite

## Quick start

```bash
npm test
npm run validate-pack -- sample-character
```

Build voice examples only from a dialogue corpus:

```bash
npm run build-persona -- --character=my-character --corpus=data/dialogue.jsonl --examples-only
```

Generate both `examples.jsonl` and `persona.md` with Claude CLI:

```bash
npm run build-persona -- --character=my-character --corpus=data/dialogue.jsonl --model=sonnet
```

Programmatic use:

```js
const path = require('node:path');
const {
  CharacterEngine,
  RuntimeContext,
  MemoryStore,
  AffinityStore,
  ConversationStateStore,
  loadCharacterPack,
} = require('./src');

const pack = loadCharacterPack(path.join(__dirname, 'characters'), 'sample-character');

const runtimeContext = new RuntimeContext({
  memoryStore: new MemoryStore({ filePath: './runtime-data/memory.json' }),
  affinityStore: new AffinityStore({ filePath: './runtime-data/affinity.json' }),
  conversationStateStore: new ConversationStateStore({ filePath: './runtime-data/conversation.json' }),
  affinityNotes: {
    favorable: 'You know this person reasonably well and can be more relaxed.',
    close: 'This is an established close relationship; comfortable banter is natural.',
  },
});

const engine = new CharacterEngine({
  pack,
  runtimeContext,
  provider: {
    async generate({ systemPrompt, userPrompt }) {
      // Call your LLM here.
      return { text: `${systemPrompt.length}:${userPrompt.length}` };
    },
  },
});

const result = await engine.respond({
  message: '眠い',
  speaker: { id: '1', name: 'user' },
  scopeId: 'channel-123',
});
```

## Character Pack

```text
characters/my-character/
├─ character.json   # stable identity + generation defaults
├─ persona.md       # nuanced personality/behavior profile
├─ rules.md         # hard RP/generation rules
├─ examples.jsonl   # contextual voice examples
└─ lore.jsonl       # world/character facts, separate from voice
```

See [`docs/character-pack.md`](docs/character-pack.md) and [`docs/building-a-character.md`](docs/building-a-character.md).

## Design rule

Voice examples are **not** lore, and lore is **not** memory. A dramatic line in one scene should not become a permanent factual belief, and a user-specific memory should not mutate the canonical character definition.

## Next parity work

- Discord adapter
- embedding/hybrid retrieval backend
- AI memory-decision reviewer
- temporary conversation reviewer + self-repair
- optional voice/STT adapter

## License

MIT
