# Character Pack format

A Character Pack is the only place where character-specific identity and voice rules should live.

## `character.json`

Required fields:

- `schemaVersion`: currently `1`.
- `id`: must match the directory name.
- `displayName`: canonical display name.
- `identity.selfDescription`: short stable identity statement.

Optional `generation` fields:

- `register`: baseline speaking register.
- `defaultMaxCharacters`: soft response-length target.
- `defaultExampleCount`: fallback number of voice examples when no retrieval result is supplied.
- `constraints`: character-specific generation constraints.

## `persona.md`

Nuanced behavioral profile: temperament, decision style, social distance, emotional expression, pacing, recurring phrasing and uncertainty handling.

## `rules.md`

Hard character-specific rules. Do not put engine implementation instructions here unless they are genuinely part of the character behavior.

## `examples.jsonl`

Contextual voice examples. Each line is one JSON object. Supported fields include:

```json
{
  "id": "line-123",
  "content": "actual character reply",
  "parts": ["optional", "multi-message", "burst"],
  "context": [{"authorName": "Other", "content": "preceding message"}],
  "repliedTo": {"authorName": "Other", "content": "quoted reply target"}
}
```

Voice examples teach **how to speak**, not canonical facts.

## `lore.jsonl`

Canonical/reference knowledge, intentionally separated from voice examples:

```json
{"id":"l1","title":"Affiliation","fact":"Character X belongs to Organization Y.","tags":["organization"]}
```

This prevents scene-specific dialogue from accidentally becoming permanent world-state.

## Runtime-only information

Do not write user-specific facts into the Character Pack. Relationship notes, durable user memory, affinity and temporary conversation state belong to the runtime and are passed separately to `CharacterEngine.respond()`.
