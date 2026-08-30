'use strict';

function displayName(message) {
  return message.member?.displayName || message.author?.globalName || message.author?.username || 'user';
}

function snowflakeBefore(a, b) {
  try { return BigInt(a) < BigInt(b); } catch (_) { return false; }
}

function recentHistory(message, max) {
  const cache = message.channel?.messages?.cache;
  if (!cache || typeof cache.values !== 'function') return [];
  return [...cache.values()]
    .filter((entry) => entry.id !== message.id && (
      snowflakeBefore(entry.id, message.id)
      || (Number(entry.createdTimestamp) || 0) < (Number(message.createdTimestamp) || Infinity)
    ))
    .sort((a, b) => (Number(a.createdTimestamp) || 0) - (Number(b.createdTimestamp) || 0))
    .slice(-max)
    .map((entry) => ({
      id: String(entry.id),
      authorId: String(entry.author?.id || ''),
      authorName: displayName(entry),
      content: String(entry.content || ''),
    }))
    .filter((entry) => entry.content);
}

async function referencedMessage(message) {
  if (!message.reference) return null;
  try {
    if (typeof message.fetchReference === 'function') return await message.fetchReference();
  } catch (_) {}
  return null;
}

class DiscordBotAdapter {
  constructor({
    engine,
    token = null,
    client = null,
    discord = null,
    botUserId = null,
    allowedChannelIds = [],
    allowedGuildIds = [],
    followUpWindowMs = 180000,
    maxHistoryMessages = 15,
  } = {}) {
    if (!engine || typeof engine.respond !== 'function') throw new TypeError('engine.respond is required');
    this.engine = engine;
    this.token = token;
    this.client = client;
    this.discord = discord;
    this.botUserId = botUserId;
    this.allowedChannelIds = new Set(allowedChannelIds.map(String));
    this.allowedGuildIds = new Set(allowedGuildIds.map(String));
    this.followUpWindowMs = followUpWindowMs;
    this.maxHistoryMessages = maxHistoryMessages;
    this.cursors = new Map();
    this._bound = (message) => this.handleMessage(message).catch((error) => console.error('[discord-adapter]', error));
  }

  _allowed(message) {
    if (!this.allowedChannelIds.size && !this.allowedGuildIds.size) return true;
    return this.allowedChannelIds.has(String(message.channelId)) || this.allowedGuildIds.has(String(message.guildId));
  }

  _isDirect(message, ref, botId) {
    if (!botId) return false;
    if (message.mentions?.has?.(botId)) return true;
    if (message.mentions?.repliedUser?.id === botId) return true;
    return ref?.author?.id === botId;
  }

  _followUp(message, botId) {
    const cursor = this.cursors.get(String(message.channelId));
    if (!cursor || Date.now() > cursor.expiresAt || !cursor.participantIds.has(String(message.author.id))) return false;
    const mentioned = message.mentions?.users && typeof message.mentions.users.keys === 'function'
      ? [...message.mentions.users.keys()].map(String)
      : [];
    if (mentioned.some((id) => id !== String(botId))) return false;
    return true;
  }

  async start() {
    if (!this.client) {
      const discord = this.discord || require('discord.js');
      this.client = new discord.Client({
        intents: [
          discord.GatewayIntentBits.Guilds,
          discord.GatewayIntentBits.GuildMessages,
          discord.GatewayIntentBits.MessageContent,
        ],
      });
    }
    this.client.on('messageCreate', this._bound);
    if (!this.client.user && this.token) await this.client.login(this.token);
    this.botUserId = this.botUserId || this.client.user?.id || null;
    return this;
  }

  async stop() {
    if (this.client?.off) this.client.off('messageCreate', this._bound);
    if (this.client?.destroy) this.client.destroy();
  }

  async handleMessage(message) {
    const botId = this.botUserId || this.client?.user?.id;
    if (!message?.author || message.author.bot || String(message.author.id) === String(botId) || !this._allowed(message)) {
      return { handled: false, reason: 'ignored' };
    }

    const ref = await referencedMessage(message);
    const direct = this._isDirect(message, ref, botId);
    const followUp = !direct && this._followUp(message, botId);
    if (!direct && !followUp) return { handled: false, reason: 'not-triggered' };

    const text = String(message.content || '').trim();
    if (!text) return { handled: false, reason: 'empty' };

    const history = recentHistory(message, this.maxHistoryMessages);
    const result = await this.engine.respond({
      message: text,
      messageId: String(message.id),
      speaker: { id: String(message.author.id), name: displayName(message) },
      scopeId: String(message.channelId),
      history,
      triggerType: direct ? 'direct' : 'follow-up',
      referencedMessage: ref ? {
        id: String(ref.id),
        authorId: String(ref.author?.id || ''),
        authorName: displayName(ref),
        content: String(ref.content || ''),
      } : null,
    });

    if (!result?.text) return { handled: true, sent: false, result };
    const payload = { content: result.text, allowedMentions: { parse: [] } };
    const sent = direct && typeof message.reply === 'function'
      ? await message.reply(payload)
      : await message.channel.send(payload);

    const key = String(message.channelId);
    const existing = this.cursors.get(key);
    const participants = existing && Date.now() <= existing.expiresAt
      ? new Set(existing.participantIds)
      : new Set();
    participants.add(String(message.author.id));
    this.cursors.set(key, { expiresAt: Date.now() + this.followUpWindowMs, participantIds: participants });
    return { handled: true, sent: true, result, message: sent };
  }
}

module.exports = { DiscordBotAdapter, displayName, recentHistory };
