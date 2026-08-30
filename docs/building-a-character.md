# Building a Character Pack from dialogue

The engine can turn a contextual dialogue corpus into `examples.jsonl` and an evidence-grounded `persona.md`.

Input is JSONL. Each line may contain:

```json
{
  "id": "unique-line-id",
  "content": "character line",
  "parts": ["optional", "message burst"],
  "context": [{"authorName":"Other","content":"preceding line"}],
  "repliedTo": {"authorName":"Other","content":"reply target"}
}
```

Generate examples only (no model call):

```bash
node src/cli/build-persona.js --character=my-character --corpus=data/dialogue.jsonl --examples-only
```

Generate both examples and `persona.md` using Claude CLI:

```bash
node src/cli/build-persona.js --character=my-character --corpus=data/dialogue.jsonl --model=sonnet
```

The builder deliberately analyzes **voice/behavior only**. Canonical facts should be curated or extracted separately into `lore.jsonl`; otherwise a one-scene emotional statement can accidentally become permanent lore.
