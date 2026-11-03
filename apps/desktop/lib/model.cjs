'use strict';
const { localEndpoint } = require('./config.cjs');
const { fault } = require('./errors.cjs');

async function boundedJson(response) {
  if (!response.ok) { void response.body?.cancel().catch(() => {}); throw fault('HTTP'); }
  const reader = response.body?.getReader(); if (!reader) throw fault('RESPONSE_INVALID');
  let size = 0; const parts = [];
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 1024 * 1024) throw fault('RESPONSE_INVALID'); parts.push(Buffer.from(value)); }
    try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw fault('RESPONSE_INVALID'); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
class LocalModel {
  constructor({ fetchImpl = fetch, environment = process.env } = {}) { this.fetch = fetchImpl; this.environment = environment; }
  async request(settings, route, body, signal) {
    const base = localEndpoint(settings.baseUrl);
    const deadline = AbortSignal.timeout(settings.timeoutSeconds * 1000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const headers = { 'Content-Type': 'application/json' };
    const key = this.environment[settings.apiKeyEnv]; if (key) headers.Authorization = `Bearer ${key}`;
    try {
      const response = await this.fetch(base + route, { method: body ? 'POST' : 'GET', headers,
        ...(body ? { body: JSON.stringify(body) } : {}), signal: combined, redirect: 'error' });
      return await boundedJson(response);
    } catch (error) {
      if (signal?.aborted) throw fault('CANCELLED');
      if (deadline.aborted) throw fault('TIMEOUT');
      if (['HTTP', 'RESPONSE_INVALID'].includes(error.code)) throw error;
      throw fault('NETWORK');
    }
  }
  async complete(settings, messages, signal) {
    if (!settings.model.trim()) throw fault('MODEL_REQUIRED');
    const result = await this.request(settings, '/chat/completions', { model: settings.model, messages, stream: false }, signal);
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > 200000) throw fault('RESPONSE_INVALID');
    if (!content.trim()) throw fault('EMPTY_REPLY');
    return content.trim();
  }
  async models(settings) {
    const result = await this.request({ ...settings, timeoutSeconds: Math.min(10, settings.timeoutSeconds) }, '/models');
    if (!Array.isArray(result?.data)) throw fault('RESPONSE_INVALID');
    return [...new Set(result.data.map(item => item?.id).filter(id => typeof id === 'string' && id.length > 0 && id.length <= 200))].slice(0, 100);
  }
}
module.exports = { LocalModel, boundedJson };
