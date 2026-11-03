'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { ConfigStore, strictJson, localEndpoint } = require('../lib/config.cjs');
const { ConversationStore } = require('../lib/store.cjs');
const { LocalModel } = require('../lib/model.cjs');
const { ChatService, contextMessages } = require('../lib/chat.cjs');
const { authorized, registerIpc } = require('../lib/ipc.cjs');
const { publicError } = require('../lib/errors.cjs');
const example = require('../../../configs/v2.example.json');

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-m1-'));
  t.after(() => {
    const resolved = path.resolve(root), boundary = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(resolved.startsWith(boundary) && path.basename(resolved).startsWith('live2d-m1-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return root;
}
async function setup(t, model) {
  const root = tempRoot(t), file = path.join(root, 'conversations.sqlite');
  const store = await ConversationStore.open(file); t.after(() => store.close());
  const config = { llm: () => ({ ...example.llm, model: 'fixture-model' }) };
  return { store, config, file, chat: new ChatService({ store, config, model }) };
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('vendored SQLite runtime matches its recorded upstream file checksums', () => {
  const root = path.resolve(__dirname, '../../../packages/sqlite-vendor');
  const record = JSON.parse(fs.readFileSync(path.join(root, 'UPSTREAM.json'), 'utf8'));
  for (const [file, expected] of Object.entries(record.files)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    assert.equal(actual, expected, file);
  }
});

test('configuration rejects duplicate keys, nonfinite values and plaintext credentials', t => {
  for (const text of ['{"x":1,"x":2}', '{"x":1e999}', '{/*comment*/"x":1}', '{"x":1,}']) assert.throws(() => strictJson(text));
  for (const url of ['https://example.com/v1', 'http://user:secret@localhost/v1', 'http://localhost/v1?secret=1', 'file:///tmp']) assert.throws(() => localEndpoint(url));
  const root = tempRoot(t), source = path.join(root, 'source.json');
  fs.writeFileSync(source, JSON.stringify(example));
  const config = new ConfigStore({ source, dataRoot: root });
  assert.throws(() => config.save({ apiKey: 'do-not-log' }));
  config.save({ model: 'my-model', baseUrl: 'http://127.0.0.1:1234/v1' });
  assert.equal(new ConfigStore({ source, dataRoot: root }).llm().model, 'my-model');
  assert.equal(JSON.parse(fs.readFileSync(source)).llm.model, '');
});

test('configuration does not update memory if disk write fails', t => {
  const root = tempRoot(t), source = path.join(root, 'source.json'); fs.writeFileSync(source, JSON.stringify(example));
  const config = new ConfigStore({ source, dataRoot: root, write() { throw Error('private failure details'); } });
  assert.throws(() => config.save({ model: 'new-model' }), { code: 'STORAGE' });
  assert.equal(config.llm().model, '');
});

test('SQLite persists completed turns and repairs interrupted replies on reopen', async t => {
  const { store, file } = await setup(t, { complete() {} });
  const conversation = store.create();
  const reply = store.beginTurn(conversation.id, "Robert'); DROP TABLE messages;--", 'generation-1');
  store.finish(reply, 'completed', '<script>not executable</script>');
  store.beginTurn(conversation.id, 'unfinished turn', 'generation-2');
  const reopened = await ConversationStore.open(file); t.after(() => reopened.close());
  assert.equal(reopened.list().length, 1);
  const messages = reopened.get(conversation.id).messages;
  assert.equal(messages[0].content, "Robert'); DROP TABLE messages;--");
  assert.equal(messages[1].content, '<script>not executable</script>');
  assert.equal(messages[3].status, 'error');
  assert.equal(reopened.completedContext(conversation.id).length, 2);
  assert.equal(fs.readFileSync(file).subarray(0, 16).toString(), 'SQLite format 3\0');
});

test('SQLite write failure rolls back in-memory and on-disk state', async t => {
  const { store, file } = await setup(t, { complete() {} }); const conversation = store.create();
  const original = fs.readFileSync(file);
  store.write = () => { throw Error('disk full'); };
  assert.throws(() => store.beginTurn(conversation.id, 'not committed', 'g1'), { code: 'STORAGE' });
  assert.equal(store.get(conversation.id).messages.length, 0);
  assert.deepEqual(fs.readFileSync(file), original);
});

test('model adapter sends its explicit messages argument and never leaks service bodies', async t => {
  let received;
  const server = http.createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    if (request.url === '/v1/models') return response.end(JSON.stringify({ data: [{ id: 'fixture-model' }] }));
    received = JSON.parse(body);
    if (received.model === 'bad-model') { response.writeHead(500); return response.end('secret upstream details'); }
    response.end(JSON.stringify({ choices: [{ message: { content: '已收到' } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const settings = { ...example.llm, baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture-model' };
  const model = new LocalModel({ environment: {} });
  const messages = [{ role: 'system', content: '请总结这次会话' }, { role: 'user', content: 'hello' }];
  assert.equal(await model.complete(settings, messages), '已收到');
  assert.deepEqual(received.messages, messages); assert.equal(received.stream, false);
  assert.deepEqual(await model.models(settings), ['fixture-model']);
  await assert.rejects(model.complete({ ...settings, model: 'bad-model' }, messages), error => {
    assert.equal(error.code, 'HTTP'); assert.ok(!publicError(error).message.includes('secret')); return true;
  });
});

test('model handles empty, invalid and oversized responses', async () => {
  const settings = { ...example.llm, model: 'fixture' };
  for (const [response, code] of [
    [new Response('{broken'), 'RESPONSE_INVALID'],
    [new Response(JSON.stringify({ choices: [{ message: { content: '  ' } }] })), 'EMPTY_REPLY'],
    [new Response('x'.repeat(1024 * 1024 + 1)), 'RESPONSE_INVALID'],
  ]) {
    const model = new LocalModel({ fetchImpl: async () => response, environment: {} });
    await assert.rejects(model.complete(settings, []), { code });
  }
});

test('model abort and deadline use distinct errors', async () => {
  const model = new LocalModel({ environment: {}, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  const settings = { ...example.llm, model: 'fixture', timeoutSeconds: 0.02 };
  // AbortSignal.timeout uses an unreferenced timer; keep this isolated mock test alive.
  const keepAlive = setTimeout(() => {}, 2000);
  try {
    await assert.rejects(model.complete(settings, []), { code: 'TIMEOUT' });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(model.complete(settings, [], controller.signal), { code: 'CANCELLED' });
  } finally { clearTimeout(keepAlive); }
});

test('cancelled late replies cannot overwrite a new generation', async t => {
  const first = deferred(), second = deferred(); let index = 0;
  const { chat, store } = await setup(t, { complete: () => (++index === 1 ? first.promise : second.promise) });
  const conversation = store.create();
  chat.send({ conversationId: conversation.id, text: 'first' }); const oldOperation = chat.active;
  assert.throws(() => chat.send({ conversationId: conversation.id, text: 'busy' }), { code: 'BUSY' });
  chat.cancel(conversation.id);
  chat.send({ conversationId: conversation.id, text: 'second' }); const newOperation = chat.active;
  first.resolve('stale reply'); await oldOperation.done;
  assert.equal(chat.active, newOperation);
  second.resolve('current reply'); await newOperation.done;
  const messages = store.get(conversation.id).messages;
  assert.equal(messages[1].status, 'cancelled'); assert.equal(messages[1].content, '');
  assert.equal(messages[3].content, 'current reply');
  assert.equal(chat.active, null);
});

test('model failure is persisted and next request can succeed', async t => {
  let index = 0;
  const { chat, store } = await setup(t, { complete: async () => { if (++index === 1) throw Error('do-not-leak'); return 'recovered'; } });
  const conversation = store.create(), events = []; chat.on('update', event => events.push(event));
  chat.send({ conversationId: conversation.id, text: 'first' }); await chat.active.done;
  assert.equal(store.get(conversation.id).messages[1].status, 'error');
  assert.ok(!JSON.stringify(events).includes('do-not-leak'));
  chat.send({ conversationId: conversation.id, text: 'second' }); await chat.active.done;
  assert.equal(store.get(conversation.id).messages[3].content, 'recovered');
});

test('context truncation preserves pairs and always retains current input', () => {
  const history = [{ role: 'user', content: 'a'.repeat(1200) }, { role: 'assistant', content: 'b'.repeat(1200) },
    { role: 'user', content: 'recent' }, { role: 'assistant', content: 'reply' }];
  const context = contextMessages(history, 'current question', 1024);
  assert.deepEqual(context.slice(1), [...history.slice(2), { role: 'user', content: 'current question' }]);
  assert.throws(() => contextMessages([], 'a'.repeat(3000), 1024), { code: 'CONTEXT_LIMIT' });
});

test('IPC rejects foreign senders, subframes and oversized payloads', async t => {
  const { chat, store, config } = await setup(t, { complete() {} });
  const frame = { url: 'file:///local/index.html' }, contents = { mainFrame: frame, send() {} };
  const event = { sender: contents, senderFrame: frame };
  assert.ok(authorized(event, contents, frame.url));
  assert.ok(!authorized({ sender: contents, senderFrame: { url: frame.url } }, contents, frame.url));
  const handlers = new Map(), ipcMain = { handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name) };
  const unregister = registerIpc({ ipcMain, window: { webContents: contents, isDestroyed: () => false }, url: frame.url, store, config, model: {}, chat });
  const badSender = await handlers.get('app:bootstrap')({ sender: {}, senderFrame: frame });
  assert.equal(badSender.error.code, 'FORBIDDEN');
  const badPayload = await handlers.get('chat:send')(event, { conversationId: store.create().id, text: 'x'.repeat(12001) });
  assert.equal(badPayload.error.code, 'INPUT_INVALID');
  unregister(); assert.equal(handlers.size, 0);
});

test('speech IPC rejects incomplete player frames and model cancellation survives a playback stop failure', async t => {
  const { chat, store, config } = await setup(t, { complete: () => new Promise(() => {}) });
  const frame = { url: 'file:///local/index.html' }, contents = { mainFrame: frame, send() {} }, event = { sender: contents, senderFrame: frame };
  const handlers = new Map(), ipcMain = { handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name) };
  const speech = new EventEmitter(); speech.stop = async () => { const error = Error(); error.code = 'PLAYBACK_STOP'; throw error; };
  speech.player = () => { throw Error('must not receive invalid payload'); };
  const unregister = registerIpc({ ipcMain, window: { webContents: contents, isDestroyed: () => false }, url: frame.url, store, config, model: {}, chat, speech });
  t.after(unregister);
  const conversationId = store.create().id;
  for (const value of [{ playbackId: conversationId, type: 'started' }, { playbackId: conversationId, type: 'ended', index: NaN }, { playbackId: conversationId, type: 'stopped', index: 0 }]) {
    assert.equal((await handlers.get('speech:player')(event, value)).error.code, 'INPUT_INVALID');
  }
  chat.send({ conversationId, text: 'stop me' }); const operation = chat.active;
  assert.equal((await handlers.get('chat:cancel')(event, { conversationId })).error.code, 'PLAYBACK_STOP');
  assert.equal(chat.active, null); assert.equal(operation.abort.signal.aborted, true);
  assert.equal(store.get(conversationId).messages[1].status, 'cancelled');
});
