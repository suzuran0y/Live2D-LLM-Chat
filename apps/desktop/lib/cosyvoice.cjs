'use strict';
const { spawn } = require('node:child_process'), fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const Ajv = require('ajv/dist/2020');
const { strictJson } = require('./config.cjs'), { fault } = require('./errors.cjs'), { validateWave } = require('./speech-backends.cjs');
const lock = require('../../../workers/tts/assets.lock.json');
const validate = new Ajv({ strict: false }).compile(require('../../../packages/contracts/worker.schema.json'));
const ROOT = path.resolve(__dirname, '../../..');
class CosyVoiceBackend {
  constructor(config, profiles, { spawnProcess = spawn, startupMs = 180000, requestMs = 120000, stopMs = 5000 } = {}) {
    Object.assign(this, { config, profiles, spawnProcess, startupMs, requestMs, stopMs });
    this.receipt = config.resourceReceipt || config.source?.replace(/\.json$/u, '.cosyvoice-verified.json');
    const root = config.config.resources?.cosyvoiceRoot;
    if (root) this.root = path.resolve(path.dirname(config.source), root);
    const python = config.config.runtime?.ttsPython;
    if (this.root) this.python = python ? path.resolve(path.dirname(config.source), python) : path.join(this.root, 'venv/Scripts/python.exe');
  }
  available() {
    try {
      if (!this.root || !fs.statSync(this.python).isFile() || fs.statSync(this.receipt).size > 16384) return false;
      const checked = strictJson(fs.readFileSync(this.receipt, 'utf8'));
      if (checked.verified !== true || path.resolve(checked.root) !== this.root || checked.engineRevision !== lock.engine.revision || checked.modelRevision !== lock.model.revision || checked.files.length !== lock.model.files.length) return false;
      return lock.model.files.every((file, index) => {
        const stat = fs.statSync(path.join(this.root, 'model', file.name), { bigint: true }), prior = checked.files[index];
        return prior.name === file.name && stat.size === BigInt(file.bytes) && stat.mtimeNs.toString() === prior.mtimeNs;
      });
    } catch { return false; }
  }
  state() { return { available: this.available(), active: !!this.child, ready: !!this.engineReady }; }
  async start() {
    clearTimeout(this.idleTimer); if (this.stopping) await this.stopping;
    if (this.child?.invalid) throw fault('TTS_STOP_FAILED'); if (this.child) return this.ready;
    if (!this.available()) throw fault('TTS_UNAVAILABLE');
    const child = this.child = this.spawnProcess(this.python, ['-X', 'faulthandler', '-u', '-m', 'workers.tts.worker', '--root', this.root, '--receipt', this.receipt, '--profiles', this.profiles.root],
      { cwd: ROOT, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.engineReady = false;
    this.ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; }); this.ready.catch(() => {});
    this.startTimer = setTimeout(() => this.failure('TTS_TIMEOUT'), this.startupMs);
    this.exited = new Promise(resolve => {
      const exit = () => { clearTimeout(this.startTimer); if (this.child === child) { this.child = null; this.engineReady = false; this.readyReject(fault('TTS_FAILED')); this.job?.reject(fault('TTS_FAILED')); } resolve(); };
      child.once('close', exit); child.once('error', exit);
    });
    child.stdin.on('error', () => {}); child.stderr.resume(); let buffer = Buffer.alloc(0);
    child.stdout.on('data', bytes => {
      if (this.child !== child || child.invalid) return;
      buffer = Buffer.concat([buffer, bytes]); if (buffer.length > 512000) return this.failure('TTS_PROTOCOL');
      for (;;) { const end = buffer.indexOf(10); if (end < 0) break; const line = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
        try { this.frame(strictJson(line.toString('utf8'), 360000), child); } catch { return this.failure('TTS_PROTOCOL'); }
      }
    });
    return this.ready;
  }
  frame(value, child) {
    if (!validate(value)) throw Error();
    if (value.type === 'ready' && !this.engineReady && value.payload.worker === 'tts' && value.payload.capabilities.includes('audioChunks')) {
      this.engineReady = true; clearTimeout(this.startTimer); this.readyResolve(); return;
    }
    if (value.type === 'error') { this.failure(value.payload.code === 'OUT_OF_MEMORY' ? 'TTS_MEMORY' : 'TTS_FAILED'); return; }
    const job = this.job; if (!this.engineReady || !job || value.requestId !== job.id) throw Error();
    if (value.type === 'profile-ready') {
      if (!['prepare-profile', 'use-profile'].includes(job.kind) || value.payload.profileId !== job.profileId || job.profileReady) throw Error();
      job.profileReady = true; return;
    }
    if (value.type === 'audio-chunk') {
      if (job.kind !== 'synthesize' || job.delivering || value.payload.index !== job.chunks || job.chunks >= 128) throw Error();
      const bytes = Buffer.from(value.payload.audio, 'base64');
      if (bytes.length > 262144 || bytes.toString('base64') !== value.payload.audio) throw Error();
      const wave = validateWave(bytes); job.bytes += bytes.length; if (job.bytes > 5000000) throw Error();
      const index = job.chunks++; job.delivering = true;
      Promise.resolve().then(() => job.onChunk({ bytes, seconds: wave.seconds, voice: 'CosyVoice3' })).then(() => {
        if (this.child !== child || child.invalid || this.job !== job) return;
        job.delivering = false; child.stdin.write(JSON.stringify({ version: 1, type: 'chunk-ack', requestId: job.id, payload: { index } }) + '\n');
      }).catch(() => { if (this.job === job) this.failure('TTS_FAILED'); }); return;
    }
    if (value.type !== 'completed' || job.delivering || (job.kind === 'synthesize' ? !job.chunks || value.payload.metrics?.chunks !== job.chunks : !job.profileReady)) throw Error();
    job.resolve(value.payload.metrics || {});
  }
  failure(code) { if (this.child) { this.child.invalid = true; this.child.kill(); } this.readyReject?.(fault(code)); this.job?.reject(fault(code)); }
  async request(kind, payload, signal, onChunk) {
    if (this.busy) throw fault('BUSY'); this.busy = true;
    const abort = () => { void this.stop().catch(() => {}); }; signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) throw fault('CANCELLED'); await this.start(); if (signal?.aborted) throw fault('CANCELLED');
      return await new Promise((resolve, reject) => {
        this.job = { id: randomUUID(), kind, profileId: payload.profileId, onChunk, chunks: 0, bytes: 0, resolve, reject };
        this.job.timer = setTimeout(() => this.failure('TTS_TIMEOUT'), this.requestMs);
        this.child.stdin.write(JSON.stringify({ version: 1, type: kind, requestId: this.job.id, payload }) + '\n');
      });
    } catch (error) { throw signal?.aborted ? fault('CANCELLED') : error; }
    finally {
      clearTimeout(this.job?.timer); this.job = null; signal?.removeEventListener('abort', abort); this.busy = false;
      if (this.child && !this.child.invalid) { this.idleTimer = setTimeout(() => void this.stop().catch(() => {}), 120000); this.idleTimer.unref(); }
    }
  }
  synthesize(text, { profileId, stream }, signal, onChunk) { return this.request('synthesize', { text, profileId, stream }, signal, onChunk); }
  prepare(profileId, signal) { return this.request('prepare-profile', { profileId }, signal); }
  warm(profileId, signal) { return this.request('use-profile', { profileId }, signal); }
  async stop() {
    clearTimeout(this.idleTimer); if (this.stopping) return this.stopping; const child = this.child; if (!child) return;
    child.invalid = true; clearTimeout(this.startTimer); this.readyReject?.(fault('CANCELLED')); this.job?.reject(fault('CANCELLED')); child.kill();
    this.stopping = (async () => { let timer; const confirmed = await Promise.race([this.exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), this.stopMs); })]); clearTimeout(timer); if (!confirmed) throw fault('TTS_STOP_FAILED'); })();
    try { await this.stopping; } finally { this.stopping = null; }
  }
}
module.exports = { CosyVoiceBackend };
