'use strict';
const fs = require('node:fs'), path = require('node:path'), { randomUUID, createHash } = require('node:crypto');
const { fault } = require('./errors.cjs');
function parseHistory(bytes) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw fault('HISTORY_INVALID');
  let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').trim(); } catch { throw fault('HISTORY_INVALID'); }
  if (!text || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text)) throw fault('HISTORY_INVALID');
  const messages = [], blocks = text.split(/^---\s*$/gmu).filter(value => value.trim()); let mode = 'structured';
  const add = (role, content) => { for (let i = 0; i < content.length; i += 12000) messages.push({ role, content: content.slice(i, i + 12000) }); };
  for (const block of blocks) {
    const match = /^(?:Time[:：]([^\n]*)\n)?(?:User|用户)[:：]([\s\S]*?)\n(?:Neko|猫娘)[:：]([\s\S]*)$/u.exec(block.trim());
    if (!match || !match[2].trim() || !match[3].trim()) { mode = 'raw-archive'; break; }
    add('user', (match[1] ? '[旧记录时间：' + match[1].trim() + ']\n' : '') + match[2]); add('assistant', match[3].trimEnd());
  }
  if (mode === 'raw-archive') { messages.length = 0; add('assistant', '[旧版原始记录，仅供查阅]\n' + text); }
  if (!messages.length || messages.length > 2000) throw fault('HISTORY_INVALID');
  return { digest: createHash('sha256').update(bytes).digest('hex'), messages, mode };
}
class HistoryImport {
  constructor({ store, chooseFile, busy = () => false }) { Object.assign(this, { store, chooseFile, busy }); }
  async preview() {
    if (this.busy()) throw fault('BUSY'); this.pending = null;
    const file = await this.chooseFile(); if (!file) return null;
    try { if (!fs.statSync(file).isFile() || fs.statSync(file).size > 5 * 1024 * 1024) throw Error(); }
    catch { throw fault('HISTORY_INVALID'); }
    const archive = parseHistory(fs.readFileSync(file));
    this.pending = { ...archive, token: randomUUID(), expires: Date.now() + 600000 };
    return { token: this.pending.token, name: path.basename(file), mode: archive.mode, count: archive.messages.length, preview: archive.messages.slice(0, 20).map(value => ({ role: value.role, content: value.content.slice(0, 1000) })) };
  }
  commit(token) {
    if (this.busy()) throw fault('BUSY');
    if (!this.pending || this.pending.token !== token || Date.now() > this.pending.expires) throw fault('HISTORY_EXPIRED');
    const result = this.store.importArchive(this.pending); this.pending = null; return result;
  }
}
module.exports = { parseHistory, HistoryImport };
