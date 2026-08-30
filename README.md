# Character Persona Engine

A reusable Node.js engine for long-running character/persona chatbots.

The project separates four things that are often mixed together in roleplay bots:

- **Identity / persona** — who the character is and how they behave.
- **Voice examples** — how the character actually speaks in context.
- **Lore** — facts the character knows about their world.
- **Runtime state** — relationship notes, memories and temporary conversation state.

Character-specific behavior lives in a Character Pack under `characters/<id>/`. The engine itself does not contain a hard-coded character identity.

## Status

Early generic core extracted from a production persona-bot architecture. The current milestone focuses on Character Packs, prompt composition, separate voice/lore retrieval, and a provider-agnostic runtime.

## Quick start

```bash
npm test
node src/cli/validate-pack.js sample-character
```

Programmatic use:

```js
const path = require('node:path');
const { CharacterEngine, loadCharacterPack } = require('./src');

const pack = loadCharacterPack(path.join(__dirname, 'characters'), 'sample-character');
const engine = new CharacterEngine({
  pack,
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

See [`docs/character-pack.md`](docs/character-pack.md).

## Design rule

Voice examples are **not** lore, and lore is **not** memory. A dramatic line in one scene should not become a permanent factual belief, and a user-specific memory should not mutate the canonical character definition.

## Roadmap

- Character Pack schema + validation
- Voice/lore retrieval separation
- Provider-neutral prompt/runtime core
- Claude CLI adapter
- Persistent user memory + affinity stores
- Discord adapter
- Embedding-backed retrieval
- Corpus-to-persona builder

## License

MIT
