# エレン Character Pack

Generated from the local Japanese corpus at the path supplied to `scripts/import-ellen-corpus.js`.

- Voice examples include only exact `ellen` speaker rows or confirmed `VO_Ellen` audio transcriptions.
- Scene-expanded rows without confirmed speakers are never used as Ellen voice examples.
- Audio files stay outside this pack; only verified transcriptions and provenance are referenced.
- Lore is curated from official-profile records rather than importing all UI and scene text.

Regenerate locally:

```powershell
node scripts/import-ellen-corpus.js --source=C:\ペルソナ
npm run validate-pack -- ellen
```
