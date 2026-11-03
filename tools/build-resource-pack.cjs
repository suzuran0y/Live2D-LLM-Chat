'use strict';
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const { hashFile, verifyPack } = require('../apps/desktop/lib/resource-pack.cjs');
const { containedFile } = require('../apps/desktop/lib/avatar-assets.cjs');
const ROOT = path.resolve(__dirname, '..');
async function buildResource(kind = 'avatar', output, modelPath) {
  if (!['avatar', 'asr'].includes(kind)) throw Error('Unknown resource kind');
  output ||= path.join(ROOT, 'dist/resource-packs', kind + '-' + randomUUID().slice(0, 8));
  if (fs.existsSync(output)) throw Error('Output already exists'); fs.mkdirSync(output, { recursive: true }); const entries = [];
  const add = async (source, relative) => { const target = path.join(output, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL); entries.push({ path: relative, bytes: fs.statSync(target).size, sha256: await hashFile(target) }); };
  let entry;
  if (kind === 'avatar') {
    const config = require('../configs/v2.example.json'), model = modelPath ? path.resolve(modelPath) : path.join(ROOT, config.resources.avatarModel), root = path.dirname(model), refs = JSON.parse(fs.readFileSync(model)).FileReferences;
    await add(containedFile(root, refs.Moc), 'model.moc3'); const sanitized = { Version: 3, FileReferences: { Moc: 'model.moc3', Textures: [] } };
    for (const [index, texture] of refs.Textures.entries()) { const name = 'texture-' + index + '.png'; await add(containedFile(root, texture), name); sanitized.FileReferences.Textures.push(name); }
    if (refs.Physics) { await add(containedFile(root, refs.Physics), 'physics.json'); sanitized.FileReferences.Physics = 'physics.json'; }
    entry = 'model.model3.json'; const temporary = path.join(output, entry); fs.writeFileSync(temporary, JSON.stringify(sanitized, null, 2)); entries.push({ path: entry, bytes: fs.statSync(temporary).size, sha256: await hashFile(temporary) });
  } else {
    for (const item of require('../packages/contracts/asr-assets.lock.json').files) await add(path.join(ROOT, 'ASR_env/SenseVoice/models/SenseVoiceSmall', item.name), 'model/' + item.name); entry = 'model';
  }
  const value = { schemaVersion: 1, kind, id: kind === 'avatar' ? 'legacy-avatar-v1' : 'sensevoice-small-v1', label: kind === 'avatar' ? '原角色资源（本机审阅）' : 'SenseVoiceSmall', redistribution: kind === 'avatar' ? 'review-required' : 'upstream-license', entry, files: entries };
  fs.writeFileSync(path.join(output, 'resource.json'), JSON.stringify(value, null, 2)); const verified = await verifyPack(output); console.log(JSON.stringify({ output, bytes: verified.total, files: entries.length, publication: 'local-review-candidate' })); return output;
}
if (require.main === module) buildResource(process.argv[2] || 'avatar', process.argv[3], process.argv[4]).catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
module.exports = { buildResource };
