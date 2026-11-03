'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { EventEmitter } = require('node:events'), { PassThrough } = require('node:stream');
const { AudioQueue } = require('../lib/audio-queue.cjs'), { CosyVoiceBackend } = require('../lib/cosyvoice.cjs');
const { VoiceProfiles } = require('../lib/voice-profiles.cjs'), { SpeechService } = require('../lib/speech.cjs');
function wave(seconds = 0.5) {
  const n = seconds * 16000, bytes = Buffer.alloc(44 + n * 2); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(n * 2, 40); for (let i = 44; i < bytes.length; i += 2) bytes.writeInt16LE(Math.round(Math.sin(i / 10) * 6000), i); return bytes;
}
function root(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-m4-'));
  t.after(() => { assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('live2d-m4-')); fs.rmSync(dir, { recursive: true, force: true }); }); return dir;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('bounded audio queue applies backpressure and cancellation releases blocked producer and consumer', async () => {
  const q = new AudioQueue(2); await q.push(1); await q.push(2); let accepted = false;
  const pending = q.push(3).then(() => { accepted = true; }); await tick(); assert.equal(accepted, false);
  assert.equal(await q.next(), 1); await pending; assert.equal(q.items.length, 2);
  const blocked = q.push(4); const rejected = assert.rejects(blocked, { code: 'CANCELLED' }); q.cancel(); await rejected;
  await assert.rejects(q.next(), { code: 'CANCELLED' }); assert.equal(q.items.length, 0);
});
test('voice import validates duration, silence, paths and transcript while keeping pending status', t => {
  const dir = root(t), profiles = new VoiceProfiles(dir), file = path.join(dir, 'sample.wav'); fs.writeFileSync(file, wave(3));
  const item = profiles.import(file, { name: '测试声音', text: '与录音匹配的文字。' });
  assert.equal(profiles.read(item.id).status, 'pending'); assert.equal(profiles.list().length, 2);
  assert.throws(() => profiles.read('../escape'), { code: 'PROFILE_INVALID' });
  assert.throws(() => profiles.import(file, { name: 'bad', text: '<|control|>' }), { code: 'PROFILE_INVALID' });
  const quiet = wave(3); quiet.fill(0, 44); fs.writeFileSync(file, quiet);
  assert.throws(() => profiles.import(file, { name: 'silent', text: '安静' }), { code: 'PROFILE_INVALID' });
});
function worker(t) {
  const dir = root(t), children = [], frames = [];
  const backend = new CosyVoiceBackend({ source: path.join(dir, 'config.json'), config: { resources: { cosyvoiceRoot: dir }, runtime: {} } }, new VoiceProfiles(dir), { requestMs: 2000, spawnProcess: () => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', 0)); };
    child.send = (type, payload, requestId = null) => child.stdout.write(JSON.stringify({ version: 1, type, requestId, payload }) + '\n');
    child.stdin.on('data', bytes => frames.push(JSON.parse(bytes))); children.push(child);
    queueMicrotask(() => child.send('ready', { worker: 'tts', capabilities: ['synthesize', 'audioChunks', 'voiceProfiles'] })); return child;
  } }); backend.available = () => true; t.after(() => backend.stop()); return { backend, children, frames };
}
test('CosyVoice acknowledges each ordered chunk only after the bounded queue accepts it', async t => {
  const { backend, children, frames } = worker(t); let accept;
  const task = backend.synthesize('你好', { profileId: 'official-demo', stream: true }, new AbortController().signal, () => new Promise(resolve => { accept = resolve; }));
  await tick(); const child = children[0], id = frames[0].requestId;
  // Two seconds exceeds the settings parser's 64 KiB cap but is a valid bounded audio frame.
  child.send('audio-chunk', { index: 0, audio: wave(2).toString('base64') }, id); await tick();
  assert.equal(frames.length, 1); accept(); await tick(); assert.equal(frames[1].type, 'chunk-ack');
  child.send('completed', { metrics: { chunks: 1 } }, id); assert.equal((await task).chunks, 1);
});
test('CosyVoice rejects out-of-order chunks and confirms process exit on cancellation', async t => {
  const { backend, children, frames } = worker(t);
  let task = backend.synthesize('你好', { profileId: 'official-demo', stream: true }, new AbortController().signal, async () => {});
  let rejected = assert.rejects(task, { code: 'TTS_PROTOCOL' }); await tick(); children[0].send('audio-chunk', { index: 1, audio: wave().toString('base64') }, frames[0].requestId); await rejected; await backend.stop();
  const abort = new AbortController(); task = backend.synthesize('取消', { profileId: 'official-demo', stream: true }, abort.signal, async () => {});
  rejected = assert.rejects(task, { code: 'CANCELLED' }); await tick(); abort.abort(); await rejected; await backend.stop(); assert.equal(backend.child, null);
});
function service(t, synthesize) {
  const dir = root(t), chat = new EventEmitter();
  const natural = { available: () => true, state: () => ({ available: true }), stop: async () => {}, synthesize };
  const speech = new SpeechService({ config: { config: { audio: { volume: 0.5, maxRecordingSeconds: 60 } } }, chat, store: { get: id => ({ id }) }, dataRoot: dir,
    asr: { available: () => false, stop: async () => {} }, natural, tts: async () => ({ audio: wave().toString('base64'), voice: 'system-fixture' }) });
  speech.on('stop', value => speech.player({ ...value, type: 'stopped' }));
  t.after(() => speech.close()); return speech;
}
test('streamed synthesis runs ahead by a bounded number of chunks and cancel discards prefetched audio', async t => {
  let produced = 0;
  const speech = service(t, async (_text, _settings, _signal, enqueue) => { for (let i = 0; i < 12; i++) { produced++; await enqueue({ bytes: wave(), voice: 'fake-cosyvoice3' }); } });
  await speech.focus('fixture'); await speech.save({ enabled: true, volume: 0.5 }); await speech.saveVoice({ backend: 'cosyvoice3', profileId: 'official-demo', stream: true });
  let played = 0; speech.on('audio', value => { played++; speech.player({ ...value, type: 'started' }); });
  const operation = speech.speak({ conversationId: 'fixture', text: '测试' }); await tick();
  assert.equal(played, 1); assert.ok(produced <= 4); assert.equal(speech.state().metrics.maxQueued, 2);
  await speech.stop(); await operation; await tick(); assert.equal(played, 1); assert.equal(speech.phase, 'idle');
});
test('all prefetched chunks finish in order before the utterance becomes idle', async t => {
  const speech = service(t, async (_text, _settings, _signal, enqueue) => {
    for (let index = 0; index < 8; index++) await enqueue({ bytes: wave(), voice: 'fake-cosyvoice3' });
    return { chunks: 8 };
  });
  await speech.focus('fixture'); await speech.save({ enabled: true, volume: 0.5 }); await speech.saveVoice({ backend: 'cosyvoice3', profileId: 'official-demo', stream: true });
  const played = []; speech.on('audio', value => { played.push(value.index); speech.player({ ...value, type: 'started' }); queueMicrotask(() => speech.player({ ...value, type: 'ended' })); });
  await speech.speak({ conversationId: 'fixture', text: '完整播放测试' });
  assert.deepEqual(played, [0, 1, 2, 3, 4, 5, 6, 7]); assert.equal(speech.phase, 'idle');
  assert.equal(speech.state().metrics.chunks, 8); assert.ok(speech.state().metrics.maxQueued <= 2);
});
test('missing GPU falls back before the first chunk but a mid-stream failure never repeats spoken text', async t => {
  const error = Object.assign(Error(), { code: 'TTS_MEMORY' });
  const speech = service(t, async () => { throw error; }); await speech.focus('fixture'); await speech.save({ enabled: true, volume: 0.5 }); await speech.saveVoice({ backend: 'cosyvoice3', profileId: 'official-demo', stream: true });
  const voices = []; speech.on('audio', value => { voices.push(speech.voice); speech.player({ ...value, type: 'started' }); speech.player({ ...value, type: 'ended' }); });
  await speech.speak({ conversationId: 'fixture', text: '你好' }); assert.deepEqual(voices, ['system-fixture']); assert.ok(speech.state().fallback);
  speech.natural.synthesize = async (_text, _settings, _signal, enqueue) => { await enqueue({ bytes: wave(), voice: 'natural-fixture' }); await tick(); throw error; };
  await speech.speak({ conversationId: 'fixture', text: '第二次' }); assert.equal(speech.state().error.code, 'TTS_MEMORY'); assert.equal(voices.filter(value => value === 'system-fixture').length, 1);
});
