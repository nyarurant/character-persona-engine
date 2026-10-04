'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

class ClaudeCliProvider {
  constructor({ bin = 'claude', model = 'sonnet', timeoutMs = 120000 } = {}) {
    this.bin = bin;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  generate({ systemPrompt, userPrompt }) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'character-persona-'));
    const systemFile = path.join(tmpDir, 'system.txt');
    fs.writeFileSync(systemFile, systemPrompt, 'utf8');
    return new Promise((resolve, reject) => {
      // Windows cannot execute .cmd/.bat launchers directly through CreateProcess. Keep the
      // normal direct executable path everywhere else, but let cmd.exe host only that wrapper.
      // All arguments here are engine-controlled; conversation text is sent over stdin below.
      const needsWindowsShell = process.platform === 'win32' && /\.(?:cmd|bat)$/iu.test(this.bin);
      const cliArgs = ['--print', '--output-format', 'json', '--model', this.model, '--setting-sources=', '--system-prompt-file', systemFile];
      const executable = needsWindowsShell ? (process.env.ComSpec || 'cmd.exe') : this.bin;
      const executableArgs = needsWindowsShell ? ['/d', '/s', '/c', this.bin, ...cliArgs] : cliArgs;
      const child = execFile(
        executable,
        executableArgs,
        { maxBuffer: 20 * 1024 * 1024, timeout: this.timeoutMs },
        (error, stdout, stderr) => {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          if (error) return reject(new Error(`Claude CLI failed: ${error.message} ${stderr}`.trim()));
          try {
            const parsed = JSON.parse(stdout.trim());
            if (parsed.is_error || parsed.stop_reason === 'refusal') {
              return reject(new Error(`Claude CLI returned ${parsed.subtype || parsed.stop_reason || 'error'}`));
            }
            resolve({
              text: String(parsed.result || ''),
              usage: parsed.usage || null,
              totalCostUsd: parsed.total_cost_usd ?? null,
            });
          } catch (parseError) {
            reject(new Error(`Invalid Claude CLI JSON: ${parseError.message}`));
          }
        },
      );
      child.stdin.end(userPrompt, 'utf8');
    });
  }
}

module.exports = { ClaudeCliProvider };
