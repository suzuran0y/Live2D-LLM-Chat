'use strict';
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { fault, publicError } = require('./errors.cjs');
const { strictJson, writeAtomic } = require('./config.cjs');
const { AsrBackend, systemSpeech, validateWave } = require('./speech-backends.cjs');
const { AudioQueue } = require('./audio-queue.cjs');
const { VoiceProfiles, validProfile } = require('./voice-profiles.cjs');
const { CosyVoiceBackend } = require('./cosyvoice.cjs');

function spokenParts(text) {
  const clipped = text.replace(/```[\s\S]*?(?:```|$)/gu, '').replace(/https?:\/\/\S+/gu, '').replace(/<\|[^|]*\|>/gu, '').slice(0, 600).trim();
  const parts = [];
  for (const sentence of clipped.match(/[^。！？!?\n]+[。！？!?]?/gu) || []) {
    for (let offset = 0; offset < sentence.length; offset += 160) if (sentence.slice(offset, offset + 160).trim()) parts.push(sentence.slice(offset, offset + 160).trim());
  }
  return parts;
}
class SpeechService extends EventEmitter {
  constructor({ config, chat, store, dataRoot, asr = new AsrBackend(config), tts = systemSpeech, profiles = new VoiceProfiles(dataRoot), natural = new CosyVoiceBackend(config, profiles), chooseVoice, playbackStartMs = 10000, stopMs = 1500 } = {}) {
    super(); Object.assign(this, { config, chat, store, asr, tts, profiles, natural, chooseVoice, playbackStartMs, stopMs });
    this.voiceFile = path.join(dataRoot, 'voice-settings.json'); this.voiceSettings = { backend: 'system', profileId: 'official-demo', stream: true };
    try { if (fs.existsSync(this.voiceFile)) { const saved = strictJson(fs.readFileSync(this.voiceFile, 'utf8')); this.validateVoice(saved); this.voiceSettings = saved; } } catch {}
    this.file = path.join(dataRoot, 'speech-settings.json'); this.settings = { enabled: false, volume: config.config.audio.volume };
    try { if (fs.existsSync(this.file)) { const saved = strictJson(fs.readFileSync(this.file, 'utf8')); this.validateSettings(saved); this.settings = saved; } }
    catch { this.settingsError = true; }
    this.phase = 'idle'; this.current = null; this.version = 0; this.lastLevel = 0; this.stops = new Map();
    this.onReply = value => { if (this.settings.enabled && value.conversationId === this.focused && !this.closed) void this.speak(value).catch(error => this.fail(error)); };
    chat.on('reply', this.onReply);
    this.watchdog = setInterval(() => { if (this.phase === 'playing' && Date.now() - this.lastLevel > 300) { this.emit('level', 0); this.lastLevel = Date.now(); } }, 100); this.watchdog.unref();
  }
  state() { return { phase: this.phase, active: !!this.current || !!this.stopping, recordingId: this.current?.kind === 'capture' ? this.current.id : null,
    conversationId: this.current?.conversationId || null, playbackId: this.current?.kind === 'speak' ? this.current.id : null,
    settings: { ...this.settings }, asrAvailable: this.asr.available(), voice: this.voice || null, error: this.error || null,
    maxSeconds: this.config.config.audio.maxRecordingSeconds, truncated: !!this.truncated,
    voiceSettings: { ...this.voiceSettings }, natural: this.natural.state(), profiles: this.profiles.list(), fallback: this.fallback || null, metrics: this.metrics || null }; }
  publish() { this.emit('update', this.state()); return this.state(); }
  fail(error) { this.phase = 'error'; this.error = publicError(error); this.emit('level', 0); return this.publish(); }
  validateSettings(value) {
    if (!value || Object.keys(value).length !== 2 || typeof value.enabled !== 'boolean' || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1) throw fault('INPUT_INVALID');
  }
  async save(value) {
    this.validateSettings(value); await this.stop();
    try { writeAtomic(this.file, JSON.stringify(value, null, 2)); } catch { throw fault('STORAGE'); }
    this.settings = { ...value }; return this.publish();
  }
  validateVoice(value) {
    if (!value || Object.keys(value).length !== 3 || !['system', 'cosyvoice3'].includes(value.backend) || !validProfile(value.profileId) || typeof value.stream !== 'boolean') throw fault('INPUT_INVALID');
  }
  async saveVoice(value) {
    this.validateVoice(value); if (value.backend === 'cosyvoice3' && !this.natural.available()) throw fault('TTS_UNAVAILABLE');
    if (!this.profiles.list().some(profile => profile.id === value.profileId && profile.status === 'ready')) throw fault('PROFILE_INVALID');
    await this.stop(); await this.natural.stop();
    try { writeAtomic(this.voiceFile, JSON.stringify(value, null, 2)); } catch { throw fault('STORAGE'); }
    this.voiceSettings = { ...value }; this.fallback = null; return this.publish();
  }
  async voiceOperation(callback) {
    if (this.chat.active || this.closed) throw fault('BUSY');
    const version = ++this.version; await this.stop(false);
    if (version !== this.version) return this.state();
    const op = this.current = { kind: 'voice', id: randomUUID(), conversationId: this.focused, abort: new AbortController() };
    this.phase = 'preparing'; this.error = null; this.publish();
    try { op.backendTask = callback(op.abort.signal); await op.backendTask; if (this.current === op) { this.current = null; this.phase = 'idle'; return this.publish(); } }
    catch (error) { if (this.current === op) { this.current = null; await this.natural.stop(); this.fail(error); throw error; } }
    return this.state();
  }
  async reloadVoice() { return this.voiceOperation(async signal => { await this.natural.stop(); await this.natural.warm(this.voiceSettings.profileId, signal); }); }
  async importVoice(value) {
    if (!this.natural.available()) throw fault('TTS_UNAVAILABLE');
    if (this.chat.active || this.current) throw fault('BUSY');
    if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 40 || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 500 || /[<>]/u.test(value.text)) throw fault('PROFILE_INVALID');
    const file = await this.chooseVoice?.(); if (!file) return this.state();
    const profile = this.profiles.import(file, value);
    return this.voiceOperation(signal => this.natural.prepare(profile.id, signal));
  }
  async prepareVoice(profileId) {
    if (!validProfile(profileId) || profileId === 'official-demo') throw fault('PROFILE_INVALID'); this.profiles.read(profileId);
    return this.voiceOperation(signal => this.natural.prepare(profileId, signal));
  }
  async focus(conversationId) { this.store.get(conversationId); this.focused = conversationId; await this.stop(); return this.state(); }
  async record(conversationId) {
    const version = ++this.version; await this.stop(false);
    if (version !== this.version || this.closed) return this.state();
    this.store.get(conversationId); if (!this.asr.available()) throw fault('ASR_UNAVAILABLE');
    if (this.chat.active) this.chat.cancel(this.chat.active.conversationId);
    this.focused = conversationId; this.error = null; this.truncated = false;
    const op = this.current = { kind: 'capture', id: randomUUID(), conversationId, abort: new AbortController() };
    this.phase = 'starting'; this.publish(); this.emit('capture', { action: 'start', id: op.id, maxSeconds: this.config.config.audio.maxRecordingSeconds });
    if (this.asr.warm) { op.warming = this.asr.warm(); op.warming.catch(() => {}); }
    op.timer = setTimeout(() => { void this.stop().then(() => this.fail(fault('MICROPHONE'))).catch(error => this.fail(error)); }, 75000);
    return this.state();
  }
  finishRecording() {
    if (this.current?.kind !== 'capture' || this.phase !== 'recording') throw fault('INPUT_INVALID');
    this.phase = 'decoding'; this.publish(); this.emit('capture', { action: 'stop', id: this.current.id }); return this.state();
  }
  async capture(value) {
    const op = this.current;
    if (!op || op.kind !== 'capture' || value?.id !== op.id) return false;
    if (value.type === 'started' && this.phase === 'starting') { this.phase = 'recording'; this.publish(); return true; }
    if (value.type === 'error') { await this.stop(); this.fail(fault(value.code === 'short' ? 'AUDIO_INVALID' : 'MICROPHONE')); return true; }
    if (value.type !== 'audio' || !['recording', 'decoding'].includes(this.phase) || !(value.audio instanceof Uint8Array)) throw fault('INPUT_INVALID');
    let bytes;
    try { ({ bytes } = validateWave(value.audio, true)); } catch (error) { await this.stop(); this.fail(error); return false; }
    clearTimeout(op.timer); this.phase = 'transcribing'; this.publish();
    try {
      op.backendTask = this.asr.transcribe(bytes, op.abort.signal);
      const text = (await op.backendTask).trim(); if (this.current !== op || op.abort.signal.aborted) return false;
      if (!text) throw fault('ASR_EMPTY');
      this.current = null; this.phase = 'idle'; let sent = false;
      try { this.chat.send({ conversationId: op.conversationId, text }); sent = true; }
      catch (error) { this.error = publicError(error); this.phase = 'error'; }
      this.emit('transcript', { conversationId: op.conversationId, text, sent }); this.publish(); return true;
    } catch (error) { if (this.current === op) { this.current = null; this.fail(error); } return false; }
  }
  async auditionVoice() { if (!this.focused) throw fault('NOT_FOUND'); await this.speak({ conversationId: this.focused, text: '你好，这是新的本地语音。很高兴和你聊天。', preview: true }); return this.state(); }
  async speak({ conversationId, text, preview = false }) {
    const version = ++this.version; await this.stop(false);
    if (version !== this.version || this.closed || !preview && !this.settings.enabled || this.focused !== conversationId) return;
    const parts = spokenParts(text); if (!parts.length) return;
    const op = this.current = { kind: 'speak', id: randomUUID(), conversationId, abort: new AbortController() };
    this.error = null; this.fallback = null; this.truncated = text.length > 600; const settings = { ...this.settings }, voiceSettings = { ...this.voiceSettings };
    const queue = op.queue = new AudioQueue(2); let chunks = 0, total = 0;
    const metrics = this.metrics = { chunks: 0, bytes: 0, maxQueued: 0, firstPlaybackMs: null }; op.startedAt = Date.now();
    const enqueue = async value => {
      if (this.current !== op || op.abort.signal.aborted) throw fault('CANCELLED');
      const wave = validateWave(value.bytes); total += wave.bytes.length;
      if (++chunks > 128 || total > 5000000) throw fault('AUDIO_INVALID');
      await queue.push({ ...wave, voice: value.voice }); metrics.maxQueued = Math.max(metrics.maxQueued, queue.items.length);
      metrics.chunks = chunks; metrics.bytes = total;
    };
    const system = async () => {
      for (const part of parts) {
        if (op.abort.signal.aborted) throw fault('CANCELLED');
        const result = await this.tts({ action: 'synthesize', text: part }, op.abort.signal);
        if (typeof result.audio !== 'string' || result.audio.length > 6700000) throw fault('AUDIO_INVALID');
        await enqueue({ bytes: Buffer.from(result.audio, 'base64'), voice: result.voice });
      }
    };
    this.phase = 'synthesizing'; this.publish();
    op.backendTask = (async () => {
      try {
        if (voiceSettings.backend === 'cosyvoice3') {
          try {
            for (const part of parts) { if (op.abort.signal.aborted) throw fault('CANCELLED'); metrics.engine = await this.natural.synthesize(part, voiceSettings, op.abort.signal, enqueue); }
          } catch (error) {
            if (op.abort.signal.aborted || chunks) throw error;
            await this.natural.stop(); if (op.abort.signal.aborted) throw fault('CANCELLED');
            this.fallback = publicError(error).message; this.publish(); await system();
          }
        } else await system();
        queue.finish();
      } catch (error) { queue.cancel(error); op.play?.reject(error); throw error; }
    })(); op.backendTask.catch(() => {});
    try {
      for (let index = 0;; index++) {
        const chunk = await queue.next(); if (!chunk || this.current !== op) break;
        const { bytes, seconds } = chunk; this.voice = typeof chunk.voice === 'string' ? chunk.voice.slice(0, 120) : null;
        this.phase = 'buffering'; this.publish();
        await new Promise((resolve, reject) => {
          op.play = { index, resolve, reject, started: false,
            startTimer: setTimeout(() => reject(fault('PLAYBACK_TIMEOUT')), this.playbackStartMs),
            timer: setTimeout(() => reject(fault('PLAYBACK_TIMEOUT')), (seconds + 15) * 1000) };
          this.emit('audio', { playbackId: op.id, index, audio: new Uint8Array(bytes), volume: settings.volume });
        });
        clearTimeout(op.play.timer); clearTimeout(op.play.startTimer); op.play = null;
        if (!queue.items.length && !queue.closed) { this.phase = 'synthesizing'; this.publish(); }
      }
      await op.backendTask;
      if (this.current === op) { this.current = null; this.phase = 'idle'; this.emit('level', 0); this.publish(); }
    } catch (error) {
      if (this.current === op) { try { await this.stop(false); } catch (stopError) { error = stopError; } this.fail(error); }
    } finally { clearTimeout(op.play?.timer); clearTimeout(op.play?.startTimer); }
  }
  player(value) {
    if (value?.type === 'stopped') { this.stops.get(value.playbackId)?.(); return true; }
    const op = this.current;
    if (!op || op.kind !== 'speak' || !op.play || value?.playbackId !== op.id || value.index !== op.play.index) return false;
    if (!['buffering', 'playing'].includes(this.phase)) return false;
    if (value.type === 'started') { if (op.play.started || this.phase !== 'buffering') return false; op.play.started = true; if (this.metrics.firstPlaybackMs === null) this.metrics.firstPlaybackMs = Date.now() - op.startedAt; clearTimeout(op.play.startTimer); this.phase = 'playing'; this.publish(); }
    else if (value.type === 'ended') { if (op.play.started) op.play.resolve(); else op.play.reject(fault('PLAYBACK_FAILED')); this.emit('level', 0); }
    else if (value.type === 'failed') op.play.reject(fault('PLAYBACK_FAILED'));
    else return false;
    return true;
  }
  level(value) {
    if (this.phase !== 'playing' || this.current?.id !== value?.playbackId || !Number.isFinite(value.level) || value.level < 0 || value.level > 1) return false;
    this.lastLevel = Date.now(); this.emit('level', value.level); return true;
  }
  async stop(invalidate = true) {
    if (invalidate) this.version++;
    if (this.stopping) return this.stopping;
    const op = this.current; this.current = null; this.emit('level', 0);
    if (!op) { this.phase = 'idle'; return this.publish(); }
    clearTimeout(op.timer); op.abort.abort(); op.queue?.cancel(); clearTimeout(op.play?.timer); clearTimeout(op.play?.startTimer); op.play?.reject(fault('CANCELLED'));
    this.phase = 'stopping'; this.publish();
    this.stopping = (async () => {
      if (op.kind === 'capture') { this.emit('capture', { action: 'cancel', id: op.id }); await this.asr.stop(); }
      else {
        let timer;
        const confirmed = new Promise(resolve => { this.stops.set(op.id, () => resolve(true)); timer = setTimeout(() => resolve(false), this.stopMs); });
        this.emit('stop', { playbackId: op.id }); const stopped = await confirmed; clearTimeout(timer); this.stops.delete(op.id);
        await this.natural.stop();
        if (op.backendTask) await op.backendTask.catch(() => {});
        if (!stopped) throw fault('PLAYBACK_STOP');
      }
      this.phase = 'idle'; this.error = null;
    })();
    try { await this.stopping; } catch (error) { this.fail(error); throw error; }
    finally { this.stopping = null; this.publish(); }
    return this.state();
  }
  async close() { this.closed = true; this.chat.off('reply', this.onReply); clearInterval(this.watchdog); try { await this.stop(); } finally { try { await this.asr.stop(); } finally { await this.natural.stop(); } } }
}
module.exports = { SpeechService, spokenParts };
