'use strict';
const fs = require('node:fs'), path = require('node:path'), { randomUUID, createHash } = require('node:crypto');
const { strictJson, writeAtomic } = require('./config.cjs');
const { validateWave } = require('./speech-backends.cjs');
const { fault } = require('./errors.cjs');
const lock = require('../../../workers/tts/assets.lock.json');
const CUSTOM = /^voice-[a-f0-9-]{36}$/u;
const validProfile = id => id === 'official-demo' || typeof id === 'string' && CUSTOM.test(id);
class VoiceProfiles {
  constructor(dataRoot) { this.root = path.join(dataRoot, 'voice-profiles'); }
  read(id) {
    if (!CUSTOM.test(id)) throw fault('PROFILE_INVALID');
    const file = path.join(this.root, id, 'profile.json');
    try {
      if (fs.statSync(file).size > 16384) throw Error(); const value = strictJson(fs.readFileSync(file, 'utf8'));
      if (value.id !== id || typeof value.name !== 'string' || value.name.length > 40 || !['pending', 'ready'].includes(value.status)
        || value.engineRevision !== lock.engine.revision || value.modelRevision !== lock.model.revision) throw Error();
      return value;
    } catch { throw fault('PROFILE_INVALID'); }
  }
  list() {
    const result = [{ id: 'official-demo', name: '官方示例（开发试听）', status: 'ready' }];
    try { for (const entry of fs.readdirSync(this.root, { withFileTypes: true })) if (entry.isDirectory() && CUSTOM.test(entry.name)) {
      try { const { id, name, status, seconds } = this.read(entry.name); result.push({ id, name, status, seconds }); } catch {}
    } } catch {}
    return result;
  }
  import(file, { name, text }) {
    if (typeof name !== 'string' || !name.trim() || name.length > 40 || typeof text !== 'string' || !text.trim() || text.length > 500 || /[<>]/u.test(text)) throw fault('PROFILE_INVALID');
    if (this.list().length >= 21) throw fault('PROFILE_LIMIT');
    let bytes, seconds;
    try {
      if (!fs.statSync(file).isFile() || fs.statSync(file).size > 5000000) throw Error();
      bytes = fs.readFileSync(file); const wave = validateWave(bytes); seconds = wave.seconds;
      if (seconds < 3 || seconds > 30 || wave.format.rate < 16000) throw Error();
      let sum = 0; for (let index = wave.dataOffset; index < wave.dataOffset + wave.dataBytes; index += 2) sum += (bytes.readInt16LE(index) / 32768) ** 2;
      if (Math.sqrt(sum / (wave.dataBytes / 2)) < 0.001) throw Error();
    } catch { throw fault('PROFILE_INVALID'); }
    const id = 'voice-' + randomUUID(), directory = path.join(this.root, id);
    const value = { id, name: name.trim(), text: text.trim(), seconds, status: 'pending', audioSha256: createHash('sha256').update(bytes).digest('hex'), engineRevision: lock.engine.revision, modelRevision: lock.model.revision };
    try { fs.mkdirSync(directory, { recursive: true }); writeAtomic(path.join(directory, 'reference.wav'), bytes); writeAtomic(path.join(directory, 'profile.json'), JSON.stringify(value)); }
    catch { throw fault('STORAGE'); }
    return { id, name: value.name, status: value.status, seconds };
  }
}
module.exports = { VoiceProfiles, validProfile };
