'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { systemSpeech, validateWave, AsrBackend } = require('../lib/speech-backends.cjs');
const { ConfigStore } = require('../lib/config.cjs');
const ROOT = path.resolve(__dirname, '../../..');
function recordingWave(input) {
  const { bytes, format, dataOffset, dataBytes } = validateWave(input);
  const frames = dataBytes / format.align, count = Math.min(60 * 16000, Math.floor(frames / format.rate * 16000));
  const output = Buffer.alloc(44 + count * 2); output.write('RIFF'); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22); output.writeUInt32LE(16000, 24); output.writeUInt32LE(32000, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34); output.write('data', 36); output.writeUInt32LE(count * 2, 40);
  for (let index = 0; index < count; index++) {
    const source = Math.min(frames - 1, Math.floor(index / 16000 * format.rate)); let sample = 0;
    for (let channel = 0; channel < format.channels; channel++) sample += bytes.readInt16LE(dataOffset + source * format.align + channel * 2);
    output.writeInt16LE(Math.round(sample / format.channels), 44 + index * 2);
  }
  return output;
}
(async () => {
  const voices = await systemSpeech({ action: 'voices' }); console.log(JSON.stringify({ backend: voices.backend, voices: voices.voices }));
  const result = await systemSpeech({ action: 'synthesize', text: '你好，这是本地语音测试。' });
  const audio = recordingWave(Buffer.from(result.audio, 'base64')); validateWave(audio, true);
  const file = path.join(ROOT, 'dist/m3-system-voice.wav'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, audio);
  console.log(JSON.stringify({ voice: result.voice, culture: result.culture, backend: result.backend, seconds: validateWave(audio).seconds, output: file }));
  if (process.argv.includes('--asr')) {
    const config = new ConfigStore({ source: path.join(ROOT, 'configs/v2.example.json'), dataRoot: path.join(ROOT, 'dist/speech-check') });
    const backend = new AsrBackend(config), started = Date.now();
    try {
      const text = await backend.transcribe(audio, new AbortController().signal); console.log(JSON.stringify({ recognizedText: text, elapsedMs: Date.now() - started })); if (!text) throw Error('ASR returned empty text');
      const warmStarted = Date.now(), second = await backend.transcribe(audio, new AbortController().signal);
      console.log(JSON.stringify({ warmRecognizedText: second, warmElapsedMs: Date.now() - warmStarted }));
    }
    finally { await backend.stop(); }
  }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
