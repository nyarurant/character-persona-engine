'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

function finiteNumber(value, fallback) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeForSpeech(value) {
  const normalized = String(value ?? '')
    .replace(/\s*\n+\s*/gu, ' ')
    .replace(/\.{2,}/gu, '…')
    .replace(/…{2,}/gu, '…')
    .replace(/\?+/gu, '？')
    .replace(/!+/gu, '！')
    .trim();
  if (!normalized || /[\u3002\uff01\uff1f…]$/u.test(normalized)) return normalized;
  return `${normalized}\u3002`;
}

function splitForSpeech(value, maxCharacters = 280) {
  const text = normalizeForSpeech(value);
  if (!text) return [];
  const characters = [...text];
  if (characters.length <= maxCharacters) return [text];

  const chunks = [];
  let current = '';
  for (const piece of text.split(/(?<=[。！？!?…])\s*/u)) {
    if (!piece) continue;
    if ([...current, ...piece].length <= maxCharacters) {
      current += piece;
      continue;
    }
    if (current) chunks.push(current.trim());
    current = '';
    const remaining = [...piece];
    while (remaining.length > maxCharacters) chunks.push(remaining.splice(0, maxCharacters).join('').trim());
    current = remaining.join('');
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

class WindowsWavPlayer {
  constructor({ bin = 'powershell.exe', timeoutMs = 120000 } = {}) {
    this.bin = bin;
    this.timeoutMs = timeoutMs;
  }

  play(filePath) {
    return new Promise((resolve, reject) => {
      const command = '$player = New-Object System.Media.SoundPlayer $env:CPE_WAV_PATH; $player.PlaySync()';
      execFile(this.bin, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
        windowsHide: true,
        timeout: this.timeoutMs,
        env: { ...process.env, CPE_WAV_PATH: path.resolve(filePath) },
      }, (error, _stdout, stderr) => {
        if (error) reject(new Error(`WAV playback failed: ${error.message} ${stderr || ''}`.trim()));
        else resolve();
      });
    });
  }
}

class StyleBertVits2Client {
  constructor({
    baseUrl = 'http://127.0.0.1:5000',
    fetchImpl = globalThis.fetch,
    timeoutMs = 60000,
    outputDir = './runtime-data/voice-output',
    defaults = {},
    player = new WindowsWavPlayer(),
    play = true,
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    if (play && (!player || typeof player.play !== 'function')) throw new TypeError('player.play is required');
    this.baseUrl = String(baseUrl).replace(/\/$/u, '');
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1000, finiteNumber(timeoutMs, 60000));
    this.outputDir = path.resolve(outputDir);
    this.defaults = { ...defaults };
    this.player = player;
    this.playEnabled = play !== false;
    this.sequence = 0;
  }

  async _request(route, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}${route}`, { ...options, signal: controller.signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`Local TTS timed out after ${this.timeoutMs}ms`);
      throw new Error(`Local TTS is unavailable at ${this.baseUrl}: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async health() {
    const response = await this._request('/health');
    if (!response.ok) throw new Error(`Local TTS health failed: HTTP ${response.status}`);
    const data = await response.json();
    if (data?.ready !== true) throw new Error('Local TTS is not ready');
    return data;
  }

  _nextOutputPath() {
    this.sequence += 1;
    const stamp = new Date().toISOString().replace(/[-:TZ.]/gu, '');
    return path.join(this.outputDir, `ellen-${stamp}-${String(this.sequence).padStart(3, '0')}.wav`);
  }

  async synthesize(text, options = {}) {
    const spokenText = normalizeForSpeech(text);
    if (!spokenText) throw new TypeError('text is required');
    if ([...spokenText].length > 300) throw new RangeError('one TTS request must be 300 characters or fewer');
    const outputPath = path.resolve(options.outputPath || this._nextOutputPath());
    const body = {
      text: spokenText,
      ...this.defaults,
      ...(options.parameters || {}),
    };
    const response = await this._request('/synthesize', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Local TTS synthesis failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
    }
    const wav = Buffer.from(await response.arrayBuffer());
    if (wav.length < 12 || wav.subarray(0, 4).toString('ascii') !== 'RIFF') {
      throw new Error('Local TTS returned invalid WAV data');
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const temporary = `${outputPath}.tmp-${process.pid}-${this.sequence}`;
    await fs.writeFile(temporary, wav);
    await fs.rename(temporary, outputPath);
    return {
      outputPath,
      text: spokenText,
      bytes: wav.length,
      generateSeconds: finiteNumber(response.headers.get('x-generate-seconds'), null),
      audioSeconds: finiteNumber(response.headers.get('x-audio-seconds'), null),
      rtf: finiteNumber(response.headers.get('x-rtf'), null),
      sampleRate: finiteNumber(response.headers.get('x-sample-rate'), null),
    };
  }

  async speak(text, options = {}) {
    const chunks = splitForSpeech(text, options.maxCharacters || 280);
    if (!chunks.length) throw new TypeError('text is required');
    const results = [];
    for (const chunk of chunks) {
      const result = await this.synthesize(chunk, { parameters: options.parameters });
      results.push(result);
      if (this.playEnabled && options.play !== false) await this.player.play(result.outputPath);
    }
    return results;
  }
}

module.exports = { StyleBertVits2Client, WindowsWavPlayer, normalizeForSpeech, splitForSpeech };
