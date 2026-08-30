# Voice / STT integration

The core engine does not own a voice transport or a speech-to-text implementation. It accepts transcript events through `TranscriptConversationAdapter`, and `VoiceSttBridge` can connect any object exposing `transcribe(input)`.

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
