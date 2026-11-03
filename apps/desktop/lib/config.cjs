'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { visit } = require('jsonc-parser');
const Ajv = require('ajv/dist/2020');
const { fault } = require('./errors.cjs');
const schema = require('../../../packages/contracts/config.schema.json');
const validate = new Ajv({ strict: true }).compile(schema);

function strictJson(text, maxBytes = 65536) {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw fault('CONFIG_INVALID');
  let invalid = false; const objects = [];
  visit(text, {
    onObjectBegin() { objects.push(new Set()); },
    onObjectProperty(name) { const current = objects.at(-1); if (!current || current.has(name)) invalid = true; current?.add(name); },
    onObjectEnd() { objects.pop(); },
    onLiteralValue(value) { if (typeof value === 'number' && !Number.isFinite(value)) invalid = true; },
    onError() { invalid = true; },
  }, { disallowComments: true, allowTrailingComma: false });
  if (invalid) throw fault('CONFIG_INVALID');
  try { return JSON.parse(text); } catch { throw fault('CONFIG_INVALID'); }
}
function localEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw fault('CONFIG_INVALID'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || /[\s\\\x00-\x1f]/u.test(value) || url.port === '0') throw fault('CONFIG_INVALID');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw fault('LOCAL_ONLY');
  return url.href.replace(/\/$/, '');
}
function validateConfig(config) {
  if (!validate(config)) throw fault('CONFIG_INVALID');
  localEndpoint(config.llm.baseUrl);
  for (const value of [...Object.values(config.runtime), ...Object.values(config.resources)]) {
    if (typeof value === 'string' && /[\x00-\x1f]/u.test(value)) throw fault('CONFIG_INVALID');
  }
  return config;
}
function writeAtomic(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}
class ConfigStore {
  constructor({ source, dataRoot, write = writeAtomic }) {
    this.source = path.resolve(source);
    this.file = path.join(dataRoot, 'model-settings.json'); this.write = write;
    this.resourceFile = path.join(dataRoot, 'resource-settings.json');
    try {
      this.config = validateConfig(strictJson(fs.readFileSync(source, 'utf8')));
      if (fs.existsSync(this.file)) {
        const llm = strictJson(fs.readFileSync(this.file, 'utf8'));
        this.config = validateConfig({ ...this.config, llm });
      }
      if (fs.existsSync(this.resourceFile)) {
        const saved = strictJson(fs.readFileSync(this.resourceFile, 'utf8'));
        if (Object.keys(saved).length !== 3 || !saved.runtime || !saved.resources || !(saved.receipt === null || typeof saved.receipt === 'string' && !/[\x00-\x1f]/u.test(saved.receipt))) throw fault('CONFIG_INVALID');
        this.config = validateConfig({ ...this.config, runtime: saved.runtime, resources: saved.resources }); this.resourceReceipt = saved.receipt;
      }
    } catch (error) { throw error.code && ['CONFIG_INVALID', 'LOCAL_ONLY'].includes(error.code) ? error : fault('CONFIG_INVALID'); }
  }
  llm() { return { ...this.config.llm }; }
  save(input) {
    const next = structuredClone(this.config);
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !['baseUrl', 'model', 'timeoutSeconds', 'contextTokens'].includes(key))) throw fault('INPUT_INVALID');
    next.llm = { ...next.llm, ...input };
    validateConfig(next);
    next.llm.model = next.llm.model.trim(); next.llm.baseUrl = localEndpoint(next.llm.baseUrl);
    try { this.write(this.file, JSON.stringify(next.llm, null, 2) + '\n'); } catch { throw fault('STORAGE'); }
    this.config = next; return this.llm();
  }
  saveResources({ runtime = {}, resources = {}, receipt = this.resourceReceipt || null }) {
    const next = validateConfig({ ...this.config, runtime: { ...this.config.runtime, ...runtime }, resources: { ...this.config.resources, ...resources } });
    try { this.write(this.resourceFile, JSON.stringify({ runtime: next.runtime, resources: next.resources, receipt }, null, 2)); } catch { throw fault('STORAGE'); }
    this.config = next; this.resourceReceipt = receipt;
  }
}
module.exports = { ConfigStore, strictJson, localEndpoint, validateConfig, writeAtomic };
