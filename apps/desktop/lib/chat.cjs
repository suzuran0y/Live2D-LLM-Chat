'use strict';
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { fault, publicError } = require('./errors.cjs');
const SYSTEM_MESSAGE = { role: 'system', content: '你是一位友好、认真且简洁的助手。请用用户使用的语言回答。' };

function contextMessages(history, text, tokens) {
  // A pessimistic UTF-8 byte estimate with reserve, not an exact model tokenizer.
  const budget = Math.floor(tokens * 0.75);
  const cost = content => Buffer.byteLength(content, 'utf8') + 64;
  if (cost(text) + cost(SYSTEM_MESSAGE.content) > budget) throw fault('CONTEXT_LIMIT');
  let used = cost(text) + cost(SYSTEM_MESSAGE.content); const turns = [];
  for (let index = history.length - 2; index >= 0; index -= 2) {
    const pair = history.slice(index, index + 2);
    const size = pair.reduce((sum, message) => sum + cost(message.content), 0);
    if (used + size > budget) break;
    turns.unshift(...pair); used += size;
  }
  return [{ ...SYSTEM_MESSAGE }, ...turns, { role: 'user', content: text }];
}
class ChatService extends EventEmitter {
  constructor({ store, config, model }) { super(); Object.assign(this, { store, config, model }); this.active = null; this.closed = false; }
  state() { return { active: this.active ? { conversationId: this.active.conversationId, generationId: this.active.generationId } : null }; }
  publish(conversationId, error = null) { this.emit('update', { conversationId, ...this.state(), error }); }
  send({ conversationId, text }) {
    if (this.closed || this.active) throw fault('BUSY');
    if (typeof text !== 'string' || !text.trim() || text.length > 12000) throw fault('INPUT_INVALID');
    const settings = this.config.llm(); if (!settings.model.trim()) throw fault('MODEL_REQUIRED');
    const messages = contextMessages(this.store.completedContext(conversationId), text.trim(), settings.contextTokens);
    const op = { conversationId, generationId: randomUUID(), abort: new AbortController() };
    op.messageId = this.store.beginTurn(conversationId, text.trim(), op.generationId);
    this.active = op; this.publish(conversationId);
    op.done = this.complete(op, settings, messages); return this.state();
  }
  async complete(op, settings, messages) {
    try {
      const reply = await this.model.complete(settings, messages, op.abort.signal);
      if (this.active !== op || op.abort.signal.aborted) return;
      this.store.finish(op.messageId, 'completed', reply); this.active = null; this.publish(op.conversationId);
      this.emit('reply', { conversationId: op.conversationId, generationId: op.generationId, text: reply });
    } catch (error) {
      if (this.active !== op) return;
      let visible = publicError(error);
      try { this.store.finish(op.messageId, 'error'); } catch (storageError) { visible = publicError(storageError); }
      this.active = null; this.publish(op.conversationId, visible);
    }
  }
  cancel(conversationId) {
    const op = this.active; if (!op || op.conversationId !== conversationId) return this.state();
    // Keep the operation active if saving fails; abort it and report storage failure.
    op.abort.abort();
    try { this.store.finish(op.messageId, 'cancelled'); }
    catch (error) { this.active = null; this.publish(op.conversationId, publicError(error)); throw error; }
    this.active = null; this.publish(op.conversationId); return this.state();
  }
  close() { this.closed = true; if (this.active) this.cancel(this.active.conversationId); }
}
module.exports = { ChatService, contextMessages };
