# Voice / STT integration

The core engine does not own a voice transport or a speech-to-text implementation. It accepts transcript events through `TranscriptConversationAdapter`, and `VoiceSttBridge` can connect any object exposing `transcribe(input)`.

For local speech output, `StyleBertVits2Client` calls a Style-Bert-VITS2-compatible `/health` and `/synthesize` HTTP server, writes WAV files atomically, and can play them synchronously on Windows. The Ellen launcher and `start:local` CLI use this adapter; TTS is applied only after all reply reviews and repairs, so the spoken text matches the final visible reply.

Discord voice output is opt-in through `discord.voiceOutput.enabled`. The bot stays out of voice until an allowed, handled text message explicitly asks it to join (for example `通話入って` or `VC来て`). It joins the requester's current VC, speaks later handled replies there, and leaves after an explicit `通話抜けて` / `VC抜けて` request. Voice intent detection is local and deterministic; it does not add another model call.

```js
const { TranscriptConversationAdapter, VoiceSttBridge } = require('../src');

const transcripts = new TranscriptConversationAdapter({
  engine,
  activation: (event) => event.direct === true,
  onReply: async (result, event) => {
    // Send result.text through your voice/text transport.
  },
});

const bridge = new VoiceSttBridge({
  transcriptAdapter: transcripts,
  transcriber: {
    async transcribe({ audio }) {
      // Call whisper.cpp, a local STT service, or another provider.
      return { text: 'transcribed speech', confidence: 0.94 };
    },
  },
});

await bridge.handleAudio({
  audio: audioBuffer,
  speaker: { id: 'user-1', name: 'A' },
  scopeId: 'voice-channel-1',
  direct: true,
});
```

`audio` is passed only to the supplied transcriber. The Character Engine receives the resulting text, speaker identity, scope, recent transcript context, and optional confidence. The built-in adapter does not persist raw audio.

Passive transcript lines are retained only in the in-memory rolling context buffer unless your surrounding application explicitly persists them elsewhere. The default activation responds only to `direct: true`; use a custom `activation(event, { history })` callback for wake-word or pause-based behavior.
