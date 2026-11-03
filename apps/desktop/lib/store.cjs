'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const initSqlJs = require('sql.js');
const { writeAtomic } = require('./config.cjs');
const { fault } = require('./errors.cjs');

class ConversationStore {
  static async open(file, { write = writeAtomic } = {}) {
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
    try {
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size > 128 * 1024 * 1024) throw fault('STORAGE');
      const db = size ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
      const store = new ConversationStore(SQL, db, file, write); store.initialize(); return store;
    } catch { throw fault('STORAGE'); }
  }
  constructor(SQL, db, file, write) { Object.assign(this, { SQL, db, file, write }); }
  rows(sql, params = []) {
    const statement = this.db.prepare(sql);
    try { statement.bind(params); const rows = []; while (statement.step()) rows.push(statement.getAsObject()); return rows; }
    finally { statement.free(); }
  }
  transact(operation) {
    const before = this.db.export();
    try {
      this.db.run('PRAGMA foreign_keys = ON'); this.db.run('BEGIN');
      const result = operation(); this.db.run('COMMIT');
      const bytes = Buffer.from(this.db.export());
      if (bytes.length > 128 * 1024 * 1024) throw fault('STORAGE');
      this.write(this.file, bytes); return result;
    } catch (error) {
      this.db.close(); this.db = new this.SQL.Database(before);
      if (error.code === 'NOT_FOUND') throw error;
      throw fault('STORAGE');
    }
  }
  initialize() {
    const version = this.rows('PRAGMA user_version')[0].user_version;
    if (version > 2) throw fault('STORAGE');
    this.transact(() => {
      this.db.run(`CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id), generationId TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, createdAt TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversationId);
        CREATE TABLE IF NOT EXISTS history_imports (digest TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id), importedAt TEXT NOT NULL);
        PRAGMA user_version = 2;`);
      this.db.run("UPDATE messages SET status = 'error' WHERE status = 'pending'");
    });
  }
  list() { return this.rows('SELECT * FROM conversations ORDER BY updatedAt DESC, rowid DESC LIMIT 200'); }
  create() {
    const id = randomUUID(), now = new Date().toISOString();
    this.transact(() => this.db.run('INSERT INTO conversations VALUES (?, ?, ?, ?)', [id, '新对话', now, now]));
    return this.get(id);
  }
  get(id) {
    const conversation = this.rows('SELECT * FROM conversations WHERE id = ?', [id])[0]; if (!conversation) throw fault('NOT_FOUND');
    return { ...conversation, messages: this.rows('SELECT * FROM messages WHERE conversationId = ? ORDER BY rowid', [id]) };
  }
  completedContext(id) {
    const messages = this.get(id).messages;
    const completed = new Set(messages.filter(message => message.role === 'assistant' && message.status === 'completed').map(message => message.generationId));
    return messages.filter(message => message.status === 'completed' && completed.has(message.generationId))
      .map(({ role, content }) => ({ role, content }));
  }
  beginTurn(id, text, generationId) {
    const conversation = this.get(id), now = new Date().toISOString(), assistantId = randomUUID();
    this.transact(() => {
      this.db.run('INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), id, generationId, 'user', text, 'completed', now]);
      this.db.run('INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)', [assistantId, id, generationId, 'assistant', '', 'pending', now]);
      this.db.run('UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?', [conversation.messages.length ? conversation.title : text.replace(/\s+/gu, ' ').slice(0, 36), now, id]);
    });
    return assistantId;
  }
  finish(messageId, status, content = '') {
    if (!['completed', 'cancelled', 'error'].includes(status)) throw fault('INPUT_INVALID');
    this.transact(() => {
      this.db.run("UPDATE messages SET status = ?, content = ? WHERE id = ? AND status = 'pending'", [status, content, messageId]);
      this.db.run('UPDATE conversations SET updatedAt = ? WHERE id = (SELECT conversationId FROM messages WHERE id = ?)', [new Date().toISOString(), messageId]);
    });
  }
  importArchive({ digest, messages }) {
    if (!/^[a-f0-9]{64}$/u.test(digest) || !Array.isArray(messages) || !messages.length || messages.length > 2000
      || messages.some(value => !['user', 'assistant'].includes(value.role) || typeof value.content !== 'string' || !value.content || value.content.length > 12000)) throw fault('HISTORY_INVALID');
    const previous = this.rows('SELECT conversationId FROM history_imports WHERE digest = ?', [digest])[0];
    if (previous) return { conversationId: previous.conversationId, duplicate: true };
    const id = randomUUID(), now = new Date().toISOString();
    try { writeAtomic(path.join(path.dirname(this.file), 'backups', 'before-import-' + id + '.sqlite'), Buffer.from(this.db.export())); } catch { throw fault('STORAGE'); }
    this.transact(() => {
      this.db.run('INSERT INTO conversations VALUES (?, ?, ?, ?)', [id, '旧版历史存档', now, now]);
      for (const value of messages) this.db.run('INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), id, randomUUID(), value.role, value.content, 'imported', now]);
      this.db.run('INSERT INTO history_imports VALUES (?, ?, ?)', [digest, id, now]);
    });
    return { conversationId: id, duplicate: false };
  }
  close() { this.db.close(); }
}
module.exports = { ConversationStore };
