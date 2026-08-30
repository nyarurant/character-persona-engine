# Character Pack format

A Character Pack is the only place where character-specific identity and voice rules should live.

## `character.json`

Current schema version: **2**. Version 1 packs are migrated in memory when loaded, and `npm run migrate-pack -- path/to/character.json --write` can update them on disk.

Required fields:

- `schemaVersion`: currently `2`.
- `id`: must match the directory name.
- `displayName`: canonical display name.
- `identity.selfDescription`: short stable identity statement.

Optional identity field:

- `identity.aliases`: array of non-empty alternate names.

Optional `generation` fields:

- `register`: baseline speaking register.
- `defaultMaxCharacters`: positive integer soft response-length target.
- `defaultExampleCount`: non-negative integer fallback number of voice examples.
- `constraints`: array of non-empty character-specific generation constraints.

## `persona.md`

Nuanced behavioral profile: temperament, decision style, social distance, emotional expression, pacing, recurring phrasing and uncertainty handling.

## `rules.md`

Hard character-specific rules. Do not put engine implementation instructions here unless they are genuinely part of the character behavior.

## `examples.jsonl`

Contextual voice examples. Each line must be one JSON object with non-empty `content`, or a non-empty string array in `parts`. `context` and `repliedTo` are validated when present.

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

Each lore record must contain a non-empty `fact` or `content`. Optional `tags` must be an array of non-empty strings.

```json
{"id":"l1","title":"Affiliation","fact":"Character X belongs to Organization Y.","tags":["organization"]}
```

Lore is canonical/reference knowledge and remains separate from voice examples.

## Runtime-only information

Do not write user-specific facts into the Character Pack. Manual relationship profiles, durable user memory, episodic shared history, affinity and temporary conversation state belong to runtime state.
