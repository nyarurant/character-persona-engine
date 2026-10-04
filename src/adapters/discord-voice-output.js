'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

function detectVoiceIntent(value) {
  const text = String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
  const mentionsVoice = /(通話|vc|ボイチャ|ボイスチャット)/iu.test(text);
  if (!mentionsVoice) return null;
  if (/(抜け|ぬけ|退出|出て|切って|きって|落ちて|おちて|離脱)/u.test(text)) return 'leave';
  if (/(入って|はいって|来て|きて|参加|繋いで|つないで)/u.test(text)) return 'join';
  return null;
}

function execFilePromise(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${path.basename(file)} failed: ${error.message} ${stderr || ''}`.trim()));
      else resolve({ stdout, stderr });
    });
  });
}

function splitForLowLatency(value, maxCharacters = 140) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  if ([...text].length <= maxCharacters) return [text];
  const sentences = text.split(/(?<=[\u3002\uff01\uff1f!?…])\s*/u).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if ([...current, ...sentence].length <= maxCharacters) {
      current += sentence;
      continue;
    }
    if (current) chunks.push(current);
    current = '';
    for (const part of sentence.split(/(?<=[\u3001,])\s*/u)) {
      if ([...current, ...part].length <= maxCharacters) {
        current += part;
      } else {
        if (current) chunks.push(current);
        current = part;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

class DiscordVoiceConnector {
  constructor({ voice = null, ffmpegBin = 'ffmpeg.exe', connectTimeoutMs = 20000, playbackTimeoutMs = 120000 } = {}) {
    this.voice = voice;
    this.ffmpegBin = ffmpegBin;
    this.connectTimeoutMs = connectTimeoutMs;
    this.playbackTimeoutMs = playbackTimeoutMs;
    this.sessions = new Map();
  }

  _voice() { return this.voice || (this.voice = require('@discordjs/voice')); }

  isConnected(guildId) { return this.sessions.has(String(guildId)); }

  async join(channel) {
    if (!channel?.guild?.id || !channel.id || !channel.guild.voiceAdapterCreator) {
      throw new TypeError('a joinable Discord voice channel is required');
    }
    const voice = this._voice();
    const guildId = String(channel.guild.id);
    const current = this.sessions.get(guildId);
    if (current?.channelId === String(channel.id)) return current;
    if (current) this.leave(guildId);
    const connection = voice.joinVoiceChannel({
      channelId: String(channel.id),
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    try {
      await voice.entersState(connection, voice.VoiceConnectionStatus.Ready, this.connectTimeoutMs);
    } catch (error) {
      connection.destroy();
      throw new Error(`Discord VC connection failed: ${error.message}`);
    }
    const player = voice.createAudioPlayer();
    connection.subscribe(player);
    const session = { guildId, channelId: String(channel.id), connection, player, queue: Promise.resolve() };
    this.sessions.set(guildId, session);
    return session;
  }

  async _transcode(wavPath) {
    const outputPath = `${wavPath}.discord.ogg`;
    await execFilePromise(this.ffmpegBin, [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', wavPath,
      '-vn', '-c:a', 'libopus', '-b:a', '96k', '-vbr', 'on', '-application', 'audio', outputPath,
    ], { timeout: this.playbackTimeoutMs });
    return outputPath;
  }

  async _playNow(session, wavPath) {
    const voice = this._voice();
    const opusPath = await this._transcode(wavPath);
    try {
      const resource = voice.createAudioResource(fs.createReadStream(opusPath), { inputType: voice.StreamType.OggOpus });
      session.player.play(resource);
      await voice.entersState(session.player, voice.AudioPlayerStatus.Playing, 10000);
      await voice.entersState(session.player, voice.AudioPlayerStatus.Idle, this.playbackTimeoutMs);
    } finally {
      await fsp.rm(opusPath, { force: true }).catch(() => {});
    }
  }

  play(guildId, wavPath) {
    const key = String(guildId);
    const session = this.sessions.get(key);
    if (!session) throw new Error(`not connected to a VC in guild ${key}`);
    const queued = session.queue.catch(() => {}).then(() => this._playNow(session, wavPath));
    session.queue = queued;
    return queued;
  }

  leave(guildId) {
    const key = String(guildId);
    const session = this.sessions.get(key);
    if (!session) return false;
    this.sessions.delete(key);
    try { session.player.stop(true); } catch (_) {}
    try { session.connection.destroy(); } catch (_) {}
    return true;
  }

  stop() { for (const guildId of [...this.sessions.keys()]) this.leave(guildId); }
}

class DiscordVoiceOutput {
  constructor({ tts, connector, keepWavFiles = false } = {}) {
    if (!tts || typeof tts.speak !== 'function') throw new TypeError('tts.speak is required');
    if (!connector || typeof connector.join !== 'function' || typeof connector.play !== 'function') {
      throw new TypeError('voice connector is required');
    }
    this.tts = tts;
    this.connector = connector;
    this.keepWavFiles = keepWavFiles;
  }

  async _speak(guildId, text) {
    if (typeof this.tts.synthesize === 'function') {
      const chunks = splitForLowLatency(text);
      const generated = [];
      let pending = chunks.length ? this.tts.synthesize(chunks[0]) : null;
      try {
        for (let index = 0; index < chunks.length; index += 1) {
          const item = await pending;
          generated.push(item);
          console.log('[discord-tts]', JSON.stringify({
            text: item.text,
            generateSeconds: item.generateSeconds,
            audioSeconds: item.audioSeconds,
            rtf: item.rtf,
            outputPath: item.outputPath,
          }));
          pending = index + 1 < chunks.length ? this.tts.synthesize(chunks[index + 1]) : null;
          await this.connector.play(guildId, item.outputPath);
          if (!this.keepWavFiles) await fsp.rm(item.outputPath, { force: true }).catch(() => {});
        }
      } finally {
        if (!this.keepWavFiles) {
          await Promise.all(generated.map((item) => fsp.rm(item.outputPath, { force: true }).catch(() => {})));
        }
      }
      return generated;
    }
    const generated = await this.tts.speak(text, { play: false });
    try {
      for (const item of generated) await this.connector.play(guildId, item.outputPath);
    } finally {
      if (!this.keepWavFiles) {
        await Promise.all(generated.map((item) => fsp.rm(item.outputPath, { force: true }).catch(() => {})));
      }
    }
    return generated;
  }

  async handleReply(result, message) {
    const guildId = String(message?.guildId || '');
    if (!guildId) return { spoken: false, reason: 'not-in-guild' };
    const intent = detectVoiceIntent(message.content);

    if (intent === 'join') {
      const channel = message.member?.voice?.channel;
      if (!channel) return { spoken: false, reason: 'author-not-in-voice', intent };
      try {
        await this.connector.join(channel);
      } catch (error) {
        console.warn(`[discord-voice] first join attempt failed, retrying: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 750));
        await this.connector.join(channel);
      }
    }

    if (!this.connector.isConnected(guildId)) return { spoken: false, reason: 'not-connected', intent };
    if (result?.text) await this._speak(guildId, result.text);
    if (intent === 'leave') this.connector.leave(guildId);
    return { spoken: Boolean(result?.text), reason: intent === 'leave' ? 'left' : 'played', intent };
  }

  stop() { this.connector.stop(); }
}

module.exports = { detectVoiceIntent, splitForLowLatency, DiscordVoiceConnector, DiscordVoiceOutput };
