'use strict';

const TONES = new Set(['calm', 'playful', 'tense', 'technical', 'affectionate', 'neutral']);
const CONVERSATION_REVIEW_SYSTEM_PROMPT = `You are a private post-send conversation reviewer for a character chatbot. Return JSON only. Maintain temporary state for the next few turns: topic, up to 3 unresolved items, active participants, tone, one running bit, and expiresInMinutes. Also detect only concrete contextual errors in the bot reply: wrong referent/speaker, contradicting an explicit correction, answering the wrong message, or unsupported shared history. Do not edit merely for style. Finally output affinityDelta as +1 only for a genuinely warm/fun/meaningful positive exchange, -1 only for real boundary discomfort or pushing after reluctance, otherwise 0. Schema: {"state":{"topic":string|null,"unresolved":string[],"participants":{"id":string|null,"name":string}[],"tone":"calm|playful|tense|technical|affectionate|neutral","runningBit":string|null,"expiresInMinutes":number},"repair":{"action":"KEEP|EDIT","replacement":string|null,"reason":string},"affinityDelta":-1|0|1}.`;

function firstJson(text) {
  const source = String(text || '');
  const start = source.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

function clean(value, maxLength) {
  const text = String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, maxLength);
  return text || null;
}

function parseConversationReview(raw) {
  const json = firstJson(raw);
  if (!json) return { ok: false, reason: 'missing-json' };
  let parsed;
  try { parsed = JSON.parse(json); } catch (_) { return { ok: false, reason: 'invalid-json' }; }
  const rawState = parsed.state || {};
  const action = String(parsed.repair?.action || 'KEEP').toUpperCase();
  if (!['KEEP', 'EDIT'].includes(action)) return { ok: false, reason: 'invalid-action' };
  const replacement = action === 'EDIT' ? clean(parsed.repair?.replacement, 1000) : null;
  if (action === 'EDIT' && !replacement) return { ok: false, reason: 'missing-replacement' };
  const affinityCandidate = Number(parsed.affinityDelta ?? 0);
  const affinityDelta = [-1, 0, 1].includes(affinityCandidate) ? affinityCandidate : 0;
  return {
    ok: true,
    value: {
      state: {
        topic: clean(rawState.topic, 160),
        unresolved: Array.isArray(rawState.unresolved)
          ? rawState.unresolved.map((entry) => clean(entry, 160)).filter(Boolean).slice(0, 3)
          : [],
        participants: Array.isArray(rawState.participants)
          ? rawState.participants.slice(0, 8).map((entry) => ({
              id: entry?.id == null ? null : String(entry.id).slice(0, 64),
              name: clean(entry?.name, 80),
            })).filter((entry) => entry.name)
          : [],
        tone: TONES.has(String(rawState.tone || '').toLowerCase())
          ? String(rawState.tone).toLowerCase()
          : 'neutral',
        runningBit: clean(rawState.runningBit, 160),
        expiresInMinutes: Math.min(60, Math.max(5, Number(rawState.expiresInMinutes) || 30)),
      },
      repair: {
        action,
        replacement,
        reason: clean(parsed.repair?.reason, 240) || '',
      },
      affinityDelta,
    },
  };
}

async function reviewConversationTurn({ provider, previousState, recentContext, currentMessage, botReply } = {}) {
  if (!provider || typeof provider.generate !== 'function') throw new TypeError('provider.generate is required');
  const result = await provider.generate({
    systemPrompt: CONVERSATION_REVIEW_SYSTEM_PROMPT,
    userPrompt: JSON.stringify({
      previousState: previousState || null,
      recentContext: (recentContext || []).slice(-10),
      currentMessage,
      botReply: String(botReply || ''),
    }),
  });
  return parseConversationReview(typeof result === 'string' ? result : result?.text);
}

function applyConversationReview(store, scopeId, review, now = new Date()) {
  if (!review?.ok) return { stateApplied: false, repair: null, affinityDelta: 0 };
  if (store) store.set(scopeId, review.value.state, now);
  return {
    stateApplied: Boolean(store),
    repair: review.value.repair,
    affinityDelta: review.value.affinityDelta,
  };
}

module.exports = {
  CONVERSATION_REVIEW_SYSTEM_PROMPT,
  parseConversationReview,
  reviewConversationTurn,
  applyConversationReview,
};
