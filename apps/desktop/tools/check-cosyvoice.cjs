'use strict';
// Explicit real GPU synthesis; never invoked by desktop startup or dependency installation.
const fs = require('node:fs'), path = require('node:path'), { spawn, execFileSync } = require('node:child_process');
const { ConfigStore } = require('../lib/config.cjs'), { CosyVoiceBackend } = require('../lib/cosyvoice.cjs');
const { VoiceProfiles } = require('../lib/voice-profiles.cjs'), { validateWave } = require('../lib/speech-backends.cjs');
const lock = require('../../../workers/tts/assets.lock.json'), ROOT = path.resolve(__dirname, '../../..');
function joinWave(parts) {
  const waves = parts.map(part => validateWave(part)); const first = waves[0];
  if (!first || waves.some(wave => wave.format.rate !== first.format.rate || wave.format.channels !== 1)) throw Error('Incompatible chunks');
  const data = Buffer.concat(waves.map(wave => wave.bytes.subarray(wave.dataOffset, wave.dataOffset + wave.dataBytes))), out = Buffer.alloc(44 + data.length);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(first.format.rate, 24); out.writeUInt32LE(first.format.rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(data.length, 40); data.copy(out, 44); return out;
}
(async () => {
  const dataRoot = path.join(ROOT, 'dist/m4-check'), source = process.env.LIVE2D_CONFIG || path.join(ROOT, 'configs/v2.local.json');
  fs.mkdirSync(dataRoot, { recursive: true }); const config = new ConfigStore({ source, dataRoot }), profiles = new VoiceProfiles(dataRoot); let diagnostics = '';
  const backend = new CosyVoiceBackend(config, profiles, { spawnProcess: (python, args, options) => { const child = spawn(python, args, { ...options, env: { ...options.env, LIVE2D_TTS_DIAGNOSTICS: '1' } }); child.stderr.on('data', bytes => { diagnostics = (diagnostics + bytes.toString('utf8')).slice(-20000); }); child.once('close', code => { diagnostics += '\nExit code: ' + code; }); return child; } });
  const records = [], start = Date.now();
  try {
    await backend.warm('official-demo', new AbortController().signal); const loadMs = Date.now() - start;
    const run = async (profileId, stream, label) => {
      const parts = [], began = Date.now(); let firstChunkMs;
      const metrics = await backend.synthesize('你好，这是新的本地语音。很高兴和你聊天。', { profileId, stream }, new AbortController().signal, async chunk => { firstChunkMs ??= Date.now() - began; parts.push(chunk.bytes); });
      const file = path.join(dataRoot, label + '.wav'); fs.writeFileSync(file, joinWave(parts));
      const record = { label, stream, firstChunkMs, ...metrics, output: file }; records.push(record); console.log(JSON.stringify(record));
    };
    await run('official-demo', true, 'cosyvoice3-stream');
    const reference = path.join(dataRoot, 'official-reference-pcm.wav');
    execFileSync(backend.python, ['-c', 'import soundfile as sf,sys; audio,rate=sf.read(sys.argv[1]); sf.write(sys.argv[2],audio,rate,subtype="PCM_16")', path.join(backend.root, 'source', lock.reference.file), reference], { windowsHide: true, stdio: 'pipe' });
    const profile = profiles.list().find(value => value.name === '官方样本缓存验证') || profiles.import(reference, { name: '官方样本缓存验证', text: lock.reference.text });
    await backend.prepare(profile.id, new AbortController().signal); if (profiles.read(profile.id).status !== 'ready') throw Error('Profile not committed');
    await backend.stop(); await run(profile.id, false, 'cosyvoice3-cached-profile');
    const abort = new AbortController(); const operation = backend.synthesize('这一段用于检查取消语音之后不会继续播放。'.repeat(8), { profileId: profile.id, stream: true }, abort.signal, async () => { abort.abort(); });
    const cancelled = await operation.then(() => false, error => error.code === 'CANCELLED'); await backend.stop(); if (!cancelled || backend.child) throw Error('Cancellation failed');
    const report = { checkedOn: new Date().toISOString(), passed: true, loadMs, records, cachedProfileReloaded: true, cancellationExitConfirmed: true, copiedModelBytes: 0, realLlmRequests: 0 };
    fs.writeFileSync(path.join(dataRoot, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } catch (error) { fs.writeFileSync(path.join(dataRoot, 'engine-diagnostics.log'), diagnostics); throw error; }
  finally { await backend.stop(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
