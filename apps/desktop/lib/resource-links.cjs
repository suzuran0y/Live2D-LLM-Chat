'use strict';
const fs = require('node:fs'), path = require('node:path'), { promisify } = require('node:util'), { execFile } = require('node:child_process'), { randomUUID } = require('node:crypto');
const { ResourcePacks, hashFile } = require('./resource-pack.cjs'), { writeAtomic } = require('./config.cjs'), { fault } = require('./errors.cjs');
const execute = promisify(execFile), lock = require('../../../workers/tts/assets.lock.json');
async function pythonVersion(python, minor) {
  const { stdout } = await execute(python, ['--version'], { windowsHide: true, timeout: 5000, maxBuffer: 4096 });
  if (!new RegExp('^Python 3\\.' + minor + '\\.\\d+\\s*$').test(stdout)) throw fault('RESOURCE_INVALID');
}
async function verifyCosy(root) {
  root = fs.realpathSync(root); const source = path.join(root, 'source');
  const git = async (directory, args) => (await execute('git', ['-C', directory, ...args], { windowsHide: true, timeout: 10000, maxBuffer: 65536 })).stdout.trim();
  if (await git(source, ['rev-parse', 'HEAD']) !== lock.engine.revision || await git(path.join(source, 'third_party/Matcha-TTS'), ['rev-parse', 'HEAD']) !== lock.engine.matchaRevision || await git(source, ['diff', 'HEAD', '--name-only', '--ignore-submodules=none'])) throw fault('RESOURCE_INVALID');
  const python = path.join(root, 'venv/Scripts/python.exe'); await pythonVersion(python, '11'); const files = [];
  for (const item of lock.model.files) { const file = path.join(root, 'model', item.name); if (fs.statSync(file).size !== item.bytes || await hashFile(file) !== item.sha256) throw fault('RESOURCE_INVALID'); files.push({ name: item.name, bytes: item.bytes, mtimeNs: fs.statSync(file, { bigint: true }).mtimeNs.toString() }); }
  if (await hashFile(path.join(source, lock.reference.file)) !== lock.reference.sha256) throw fault('RESOURCE_INVALID');
  return { python, report: { schemaVersion: 1, root, verified: true, engineRevision: lock.engine.revision, modelRevision: lock.model.revision, files } };
}
class ResourceManager extends ResourcePacks {
  constructor(options) { super(options); Object.assign(this, { chooseCosy: options.chooseCosy, choosePython: options.choosePython }); }
  async link(kind) {
    if (this.busy() || this.working) throw fault('BUSY'); this.working = true;
    try {
      if (kind === 'asr-python') { const python = await this.choosePython(); if (!python) return null; await pythonVersion(python, '(?:11|12)'); await this.apply({ runtime: { asrPython: python } }); return { kind, connected: true }; }
      const root = await this.chooseCosy(); if (!root) return null; const { python, report } = await verifyCosy(root);
      const receipt = path.join(this.dataRoot, 'cosyvoice-verified-' + randomUUID() + '.json'); writeAtomic(receipt, JSON.stringify(report, null, 2));
      await this.apply({ resources: { cosyvoiceRoot: report.root }, runtime: { ttsPython: python }, receipt }); return { kind: 'cosyvoice3', connected: true, copiedModelBytes: 0 };
    } catch (error) { throw ['BUSY', 'STORAGE'].includes(error.code) ? error : fault('RESOURCE_INVALID'); } finally { this.working = false; }
  }
}
module.exports = { ResourceManager, verifyCosy, pythonVersion };
