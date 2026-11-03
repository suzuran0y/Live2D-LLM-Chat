'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SpeechService, spokenParts } = require('../lib/speech.cjs');
const { validateWave, AsrBackend } = require('../lib/speech-backends.cjs');
const { microphoneAllowed } = require('../lib/media-permission.cjs');
const { prepare, at } = require('../ui/audio-envelope.js');

function wave(seconds = 0.5) {
  const count = Math.floor(seconds * 16000), bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  return bytes;
}
function setup(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-speech-test-'));
  const chat = new EventEmitter(); chat.messages = []; chat.send = value => chat.messages.push(value); chat.cancel = () => { chat.active = null; };
  const config = { config: { audio: { volume: 0.65, maxRecordingSeconds: 60 } } };
  const asr = options.asr || { available: () => true, stop: async () => {}, transcribe: async () => '你好' };
  const speech = new SpeechService({ config, chat, store: { get: id => ({ id }) }, dataRoot: root, asr, tts: async () => ({ audio: wave().toString('base64'), voice: 'fixture' }), ...options });
  t.after(async () => {
    speech.on('stop', value => speech.player({ ...value, type: 'stopped' })); await speech.close().catch(() => {});
    const resolved = path.resolve(root); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('live2d-speech-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { speech, chat, root };
}
test('WAV boundaries reject silence length errors and truncated RIFF payloads', () => {
  assert.equal(validateWave(wave(), true).seconds, 0.5);
  for (const audio of [wave(0.3), wave().subarray(0, 100), Buffer.from('not a wave')]) assert.throws(() => validateWave(audio, true));
});
test('PCM envelope follows sound, returns zero for silence, mute and out-of-range time', () => {
  const samples = new Float32Array(16000); samples.fill(0.15, 1600, 8000);
  const envelope = prepare({ sampleRate: 16000, length: samples.length, numberOfChannels: 1, getChannelData: () => samples });
  assert.equal(at(envelope, 0, 1), 0); assert.ok(at(envelope, 0.2, 0.65) > 0);
  assert.equal(at(envelope, 0.2, 0), 0); assert.equal(at(envelope, 1.1, 1), 0); assert.equal(at(envelope, NaN, 1), 0);
});
test('microphone permission requires explicit recording, exact window, main frame and audio only', () => {
  const contents = { getURL: () => 'file:///app/index.html' }, window = { webContents: contents };
  const args = { contents, window, permission: 'media', url: contents.getURL(), speech: { phase: 'starting' }, details: { isMainFrame: true, mediaTypes: ['audio'] } };
  assert.equal(microphoneAllowed(args), true);
  for (const extra of [{ permission: 'display-capture' }, { speech: { phase: 'idle' } }, { contents: {} },
    { details: { isMainFrame: false, mediaTypes: ['audio'] } }, { details: { isMainFrame: true, mediaTypes: ['audio', 'video'] } }]) assert.equal(microphoneAllowed({ ...args, ...extra }), false);
});
test('recording result is routed to the original conversation and too-short audio fails', async t => {
  const { speech, chat } = setup(t); await speech.record('conversation-a');
  const id = speech.state().recordingId; await speech.capture({ id, type: 'started' });
  speech.finishRecording(); await speech.capture({ id, type: 'audio', audio: new Uint8Array(wave()) });
  assert.deepEqual(chat.messages, [{ conversationId: 'conversation-a', text: '你好' }]);
  await speech.record('conversation-b'); const next = speech.state().recordingId;
  await speech.capture({ id: next, type: 'started' }); await speech.capture({ id: next, type: 'audio', audio: new Uint8Array(wave(0.2)) });
  assert.equal(chat.messages.length, 1); assert.equal(speech.state().error.code, 'AUDIO_INVALID');
});
test('cancelled ASR late results cannot send messages into a new conversation', async t => {
  let complete;
  const asr = { available: () => true, stop: async () => {}, transcribe: () => new Promise(resolve => { complete = resolve; }) };
  const { speech, chat } = setup(t, { asr }); await speech.record('old'); const id = speech.state().recordingId;
  await speech.capture({ id, type: 'started' }); const pending = speech.capture({ id, type: 'audio', audio: new Uint8Array(wave()) });
  await speech.focus('new'); complete('迟到的识别'); await pending; assert.equal(chat.messages.length, 0);
});
test('missing model configuration preserves recognized text as an unsent draft', async t => {
  const { speech, chat } = setup(t); chat.send = () => { const error = Error(); error.code = 'MODEL_REQUIRED'; throw error; };
  let draft; speech.on('transcript', value => { draft = value; });
  await speech.record('fixture'); const id = speech.state().recordingId; await speech.capture({ id, type: 'started' });
  await speech.capture({ id, type: 'audio', audio: new Uint8Array(wave()) }); assert.equal(draft.text, '你好'); assert.equal(draft.sent, false);
});
test('system speech waits for actual playback acknowledgements and rejects stale mouth levels', async t => {
  const { speech } = setup(t); await speech.focus('fixture'); await speech.save({ enabled: true, volume: 0.65 });
  let playbackId; const phases = [];
  speech.on('update', value => phases.push(value.phase));
  speech.on('audio', value => {
    playbackId = value.playbackId;
    assert.equal(speech.level({ playbackId, level: 0.5 }), false);
    speech.player({ ...value, type: 'started' }); assert.equal(speech.level({ playbackId, level: 0.5 }), true);
    assert.equal(speech.player({ ...value, type: 'started' }), false);
    speech.player({ ...value, type: 'ended' });
  });
  await speech.speak({ conversationId: 'fixture', text: '你好。' });
  assert.ok(phases.includes('playing')); assert.equal(speech.state().phase, 'idle');
  assert.equal(speech.level({ playbackId, level: 1 }), false); assert.equal(speech.player({ playbackId, index: 0, type: 'started' }), false);
});
test('speech stop requires confirmation and leaves a clear error on timeout', async t => {
  const { speech } = setup(t, { stopMs: 20 }); await speech.focus('fixture'); await speech.save({ enabled: true, volume: 0.5 });
  let ready; const audio = new Promise(resolve => { ready = resolve; }); speech.once('audio', ready);
  const operation = speech.speak({ conversationId: 'fixture', text: '你好。' }); await audio;
  await assert.rejects(speech.stop(), { code: 'PLAYBACK_STOP' }); await operation;
  assert.equal(speech.state().error.code, 'PLAYBACK_STOP');
});
test('spoken text chunks stay bounded and do not read fenced code or links', () => {
  const parts = spokenParts('开始。```' + 'code'.repeat(200) + '```正文。https://example.com\n' + '字'.repeat(800));
  assert.ok(parts.every(value => value.length <= 160)); assert.ok(parts.join('').length <= 600);
  assert.ok(!parts.join('').includes('code')); assert.ok(!parts.join('').includes('https'));
});

function workerFixture(t, respond = true) {
  const children = [];
  const backend = new AsrBackend({ source: __filename, config: { runtime: { asrPython: null }, resources: { legacyRoot: '.' } } }, { spawnProcess: () => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.killed = false; child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', 0)); return true; };
    child.send = (type, payload, requestId = null) => child.stdout.write(JSON.stringify({ version: 1, type, requestId, payload }) + '\n');
    child.stdin.on('data', bytes => { const request = JSON.parse(bytes); if (respond) { child.send('transcript', { text: '本地识别' }, request.requestId); child.send('completed', {}, request.requestId); } });
    queueMicrotask(() => child.send('ready', { worker: 'asr', capabilities: ['transcribe'] })); children.push(child); return child;
  } });
  backend.available = () => true;
  t.after(() => backend.stop()); return { backend, children };
}

test('resident ASR worker is prewarmed once and reused for successive recordings', async t => {
  const { backend, children } = workerFixture(t); await backend.warm();
  for (let index = 0; index < 2; index++) assert.equal(await backend.transcribe(wave(), new AbortController().signal), '本地识别');
  assert.equal(children.length, 1); await backend.stop(); assert.ok(children[0].killed); assert.equal(backend.child, null);
});

test('ASR cancellation confirms process exit and a later request starts a new worker', async t => {
  const { backend, children } = workerFixture(t, false); await backend.warm();
  const abort = new AbortController(), operation = backend.transcribe(wave(), abort.signal);
  const rejected = assert.rejects(operation, { code: 'CANCELLED' }); abort.abort(); await rejected; await backend.stop();
  assert.equal(backend.child, null); assert.ok(children[0].killed);
  await backend.warm(); assert.equal(children.length, 2);
});

test('ASR rejects malformed worker output and exits the failed process', async t => {
  const { backend, children } = workerFixture(t, false); await backend.warm();
  const operation = backend.transcribe(wave(), new AbortController().signal);
  const rejected = assert.rejects(operation, { code: 'ASR_FAILED' });
  await new Promise(resolve => setImmediate(resolve)); children[0].stdout.write('{invalid}\n'); await rejected;
  await backend.stop(); assert.ok(children[0].killed);
});

test('avatar mouth only opens during speech and resets immediately on silence or pause', async () => {
  const { AvatarDriver } = await import('../../../packages/avatar/driver.mjs');
  const driver = new AvatarDriver(() => 0); driver.setAudioLevel(0.8);
  assert.equal(driver.update(0.05).ParamMouthOpenY, 0);
  driver.setState('speaking'); driver.setAudioLevel(0.8); assert.ok(driver.update(0.05).ParamMouthOpenY > 0.1);
  driver.setAudioLevel(0); assert.equal(driver.update(0.05).ParamMouthOpenY, 0);
  driver.setAudioLevel(0.8); driver.update(0.05); driver.setPaused(true); assert.equal(driver.values.ParamMouthOpenY, 0);
  driver.setPaused(false); driver.setState('listening'); driver.setAudioLevel(1); assert.equal(driver.update(0.05).ParamMouthOpenY, 0);
});
