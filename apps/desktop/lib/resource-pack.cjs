'use strict';
const fs = require('node:fs'), path = require('node:path'), { createHash, randomUUID } = require('node:crypto');
const { strictJson, writeAtomic } = require('./config.cjs'), { fault } = require('./errors.cjs');
const { AvatarAssets } = require('./avatar-assets.cjs');
const asrLock = require('../../../packages/contracts/asr-assets.lock.json');
function safeFile(root, relative) {
  if (typeof relative !== 'string' || relative.length > 400 || relative.split('/').some(part => !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,120}$/u.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part) || part.endsWith('.'))) throw fault('RESOURCE_INVALID');
  const base = fs.realpathSync(root); let file = base;
  for (const part of relative.split('/')) { file = path.join(file, part); if (fs.lstatSync(file).isSymbolicLink()) throw fault('RESOURCE_INVALID'); }
  if (!fs.statSync(file).isFile()) throw fault('RESOURCE_INVALID'); return file;
}
async function hashFile(file) {
  const hash = createHash('sha256'); for await (const bytes of fs.createReadStream(file)) hash.update(bytes); return hash.digest('hex');
}
function readManifest(root) {
  const file = safeFile(root, 'resource.json'); if (fs.statSync(file).size > 65536) throw fault('RESOURCE_INVALID');
  const value = strictJson(fs.readFileSync(file, 'utf8'));
  if (!value || Object.keys(value).sort().join(',') !== 'entry,files,id,kind,label,redistribution,schemaVersion' || value.schemaVersion !== 1
    || !['avatar', 'asr'].includes(value.kind) || typeof value.id !== 'string' || !/^[a-z0-9-]{1,64}$/u.test(value.id) || typeof value.label !== 'string' || value.label.length > 80
    || !['review-required', 'upstream-license'].includes(value.redistribution) || typeof value.entry !== 'string'
    || !Array.isArray(value.files) || !value.files.length || value.files.length > 128) throw fault('RESOURCE_INVALID');
  let total = 0; const names = new Set();
  for (const item of value.files) {
    if (!item || Object.keys(item).sort().join(',') !== 'bytes,path,sha256' || typeof item.path !== 'string' || names.has(item.path.toLowerCase())
      || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || !/^[a-f0-9]{64}$/u.test(item.sha256)) throw fault('RESOURCE_INVALID');
    safeFile(root, item.path); names.add(item.path.toLowerCase()); total += item.bytes;
  }
  if (total > (value.kind === 'avatar' ? 64 * 1024 * 1024 : 1536 * 1024 * 1024)) throw fault('RESOURCE_INVALID');
  if (value.kind === 'asr' && (value.entry !== 'model' || value.files.length !== asrLock.files.length || !asrLock.files.every(expected => value.files.some(item => item.path === 'model/' + expected.name && item.bytes === expected.bytes && item.sha256 === expected.sha256)))) throw fault('RESOURCE_INVALID');
  if (value.kind === 'avatar') {
    if (!value.files.some(item => item.path === value.entry)) throw fault('RESOURCE_INVALID');
    const assets = new AvatarAssets({ source: path.join(root, 'unused.json'), config: { resources: { legacyRoot: root, avatarModel: value.entry } } });
    if (assets.error || [...assets.files.entries()].some(([route, item]) => route.startsWith('/model/') && item.file && !value.files.some(entry => path.resolve(root, entry.path) === item.file))) throw fault('RESOURCE_INVALID');
  }
  return { ...value, total };
}
async function verifyPack(root) {
  const value = readManifest(root);
  for (const item of value.files) { const file = safeFile(root, item.path); if (fs.statSync(file).size !== item.bytes || await hashFile(file) !== item.sha256) throw fault('RESOURCE_INVALID'); }
  return value;
}
class ResourcePacks {
  constructor({ dataRoot, config, choosePack, apply, busy }) { Object.assign(this, { dataRoot, config, choosePack, apply, busy }); }
  async preview() {
    if (this.busy() || this.working) throw fault('BUSY'); this.pending = null; this.working = true;
    try { const root = await this.choosePack(); if (!root) return null; const value = await verifyPack(root); this.pending = { root, value, token: randomUUID(), expires: Date.now() + 600000 }; return { token: this.pending.token, kind: value.kind, label: value.label, bytes: value.total, count: value.files.length }; }
    catch (error) { throw error.code === 'BUSY' ? error : fault('RESOURCE_INVALID'); } finally { this.working = false; }
  }
  async install(token) {
    if (this.busy() || this.working) throw fault('BUSY'); const selected = this.pending;
    if (!selected || selected.token !== token || Date.now() > selected.expires) throw fault('RESOURCE_INVALID'); this.working = true;
    try {
      const value = await verifyPack(selected.root); if (JSON.stringify(value) !== JSON.stringify(selected.value)) throw fault('RESOURCE_INVALID');
      const directory = path.join(this.dataRoot, 'resources', value.kind, randomUUID()); fs.mkdirSync(directory, { recursive: true });
      for (const item of value.files) {
        const source = safeFile(selected.root, item.path), target = path.join(directory, item.path); fs.mkdirSync(path.dirname(target), { recursive: true });
        await fs.promises.copyFile(source, target, fs.constants.COPYFILE_EXCL);
        if (fs.statSync(target).size !== item.bytes || await hashFile(target) !== item.sha256) throw fault('RESOURCE_INVALID');
      }
      writeAtomic(path.join(directory, 'resource.json'), JSON.stringify(selected.value, (key, val) => key === 'total' ? undefined : val, 2));
      await verifyPack(directory);
      await this.apply(value.kind === 'avatar' ? { resources: { avatarRoot: directory, avatarModel: value.entry } } : { resources: { asrModel: path.join(directory, value.entry) } });
      this.pending = null; return { kind: value.kind, label: value.label, installed: true };
    } catch (error) { throw ['STORAGE', 'BUSY'].includes(error.code) ? error : fault('RESOURCE_INVALID'); } finally { this.working = false; }
  }
}
module.exports = { safeFile, hashFile, readManifest, verifyPack, ResourcePacks };
