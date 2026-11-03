'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Ajv = require('ajv/dist/2020');
const { fault } = require('./errors.cjs');
const { strictJson } = require('./config.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const validateFrame = new Ajv({ strict: false }).compile(require('../../../packages/contracts/worker.schema.json'));

function validateWave(input, recording = false) {
  const bytes = Buffer.from(input);
  if (bytes.length < 44 || bytes.length > (recording ? 1920044 : 5000000)
      || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
      || bytes.readUInt32LE(4) !== bytes.length - 8) throw fault('AUDIO_INVALID');
  let format, data, dataOffset;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > bytes.length) throw fault('AUDIO_INVALID');
    if (name === 'fmt ' && size >= 16) format = { type: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2), rate: bytes.readUInt32LE(start + 4), align: bytes.readUInt16LE(start + 12), bits: bytes.readUInt16LE(start + 14) };
    if (name === 'data') { data = size; dataOffset = start; }
    offset = start + size + (size % 2);
  }
  if (!format || format.type !== 1 || format.bits !== 16 || ![1, 2].includes(format.channels)
      || format.align !== format.channels * 2 || format.rate < 8000 || format.rate > 96000 || !data || data % format.align) throw fault('AUDIO_INVALID');
  const seconds = data / (format.rate * format.align);
  if (recording && (format.channels !== 1 || format.rate !== 16000 || seconds < 0.4 || seconds > 60)) throw fault('AUDIO_INVALID');
  return { bytes, seconds, format, dataOffset, dataBytes: data };
}
function systemSpeech(input, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../tools/system-speech.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const buffers = []; let size = 0, finished = false;
    const kill = () => child.kill();
    const timer = setTimeout(kill, 30000); signal?.addEventListener('abort', kill, { once: true }); if (signal?.aborted) kill();
    child.stdout.on('data', bytes => { size += bytes.length; if (size > 7000000) kill(); else buffers.push(bytes); });
    child.stderr.resume(); child.stdin.on('error', () => {});
    const finish = error => {
      if (finished) return; finished = true; clearTimeout(timer); signal?.removeEventListener('abort', kill);
      if (signal?.aborted) return reject(fault('CANCELLED'));
      if (error) return reject(fault('SYNTHESIS_FAILED'));
      try { const value = JSON.parse(Buffer.concat(buffers).toString('utf8').replace(/^\uFEFF/u, '')); if (value.error) throw Error(); resolve(value); }
      catch { reject(fault('SYNTHESIS_FAILED')); }
    };
    child.once('error', () => finish(true)); child.once('close', code => finish(code !== 0)); child.stdin.end(JSON.stringify(input));
  });
}
class AsrBackend {
  constructor(config, { spawnProcess = spawn } = {}) {
    this.spawn = spawnProcess;
    const configured = config.config.runtime.asrPython;
    this.python = configured ? path.resolve(path.dirname(config.source), configured) : path.join(ROOT, '.venv-asr/Scripts/python.exe');
    this.model = path.resolve(path.dirname(config.source), config.config.resources.legacyRoot, config.config.resources.asrModel || 'ASR_env/SenseVoice/models/SenseVoiceSmall');
  }
  available() { return fs.existsSync(this.python) && fs.existsSync(path.join(this.model, 'model.pt')); }
  async warm() {
    clearTimeout(this.idleTimer); if (this.stopping) await this.stopping;
    if (this.child) return this.ready;
    if (!this.available()) throw fault('ASR_UNAVAILABLE');
    const child = this.child = this.spawn(this.python, ['-m', 'workers.asr.worker', '--model', this.model], { cwd: ROOT, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_OFFLINE: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; }); this.ready.catch(() => {});
    let pending = Buffer.alloc(0), ready = false;
    const failure = () => { this.readyReject(fault('ASR_FAILED')); this.job?.reject(fault('ASR_FAILED')); child.kill(); };
    const startup = setTimeout(failure, 90000);
    this.exit = new Promise(resolve => {
      const done = () => { clearTimeout(startup); if (this.child === child) { this.child = null; this.readyReject(fault('ASR_FAILED')); this.job?.reject(fault('ASR_FAILED')); } resolve(); };
      child.once('close', done); child.once('error', done);
    });
    child.stderr.resume(); child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => {
      if (this.child !== child) return;
      pending = Buffer.concat([pending, chunk]); if (pending.length > 65536) return failure();
      for (;;) {
        const end = pending.indexOf(10); if (end < 0) break;
        const line = pending.subarray(0, end); pending = pending.subarray(end + 1);
        try {
          const value = strictJson(line.toString('utf8')); if (!validateFrame(value)) throw Error();
          if (value.type === 'ready' && value.requestId === null && !ready && value.payload.worker === 'asr' && value.payload.capabilities.includes('transcribe')) { ready = true; clearTimeout(startup); this.readyResolve(); }
          else if (value.type === 'error') { if (this.job && value.requestId === this.job.id) this.job.reject(fault('ASR_FAILED')); else failure(); }
          else if (!ready || value.requestId !== this.job?.id) throw Error();
          else if (value.type === 'transcript' && this.job.text === null) this.job.text = value.payload.text;
          else if (value.type === 'completed' && this.job.text !== null) this.job.resolve(this.job.text);
          else throw Error();
        } catch { return failure(); }
      }
    });
    return this.ready;
  }
  async transcribe(audio, signal) {
    if (this.busy) throw fault('BUSY'); this.busy = true;
    const abort = () => { void this.stop().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) throw fault('CANCELLED');
      await this.warm(); if (signal.aborted) throw fault('CANCELLED');
      return await new Promise((resolve, reject) => {
        this.job = { id: randomUUID(), text: null, resolve, reject };
        this.job.timer = setTimeout(() => { reject(fault('ASR_TIMEOUT')); void this.stop().catch(() => {}); }, 120000);
        this.child.stdin.write(JSON.stringify({ version: 1, type: 'transcribe', requestId: this.job.id, payload: { audio: audio.toString('base64'), language: 'auto' } }) + '\n');
      });
    } catch (error) { throw signal.aborted ? fault('CANCELLED') : error; }
    finally {
      clearTimeout(this.job?.timer); this.job = null; signal.removeEventListener('abort', abort);
      this.busy = false;
      this.idleTimer = setTimeout(() => { void this.stop().catch(() => {}); }, 120000); this.idleTimer.unref();
    }
  }
  async stop() {
    clearTimeout(this.idleTimer); if (this.stopping) return this.stopping;
    if (!this.child) return;
    const child = this.child; child.kill();
    this.readyReject?.(fault('CANCELLED')); this.job?.reject(fault('CANCELLED'));
    this.stopping = (async () => {
      let timer; const stopped = await Promise.race([this.exit.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 2500); })]); clearTimeout(timer);
      if (!stopped) throw fault('ASR_STOP_FAILED');
      if (this.child === child) this.child = null;
    })();
    try { await this.stopping; } finally { this.stopping = null; }
  }
}
module.exports = { validateWave, systemSpeech, AsrBackend };
