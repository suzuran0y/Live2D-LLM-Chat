'use strict';
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { boot } = require('../main.cjs');
const { ConversationStore } = require('../lib/store.cjs');
const example = require('../../../configs/v2.example.json');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-m1-smoke-'));
fs.mkdirSync(path.join(root, 'electron')); app.setPath('userData', path.join(root, 'electron'));
let server, desktop, exitCode = 1;
async function waitFor(check, milliseconds = 8000) {
  const started = Date.now();
  while (!(await check())) { if (Date.now() - started > milliseconds) throw Error('Smoke wait timed out'); await new Promise(resolve => setTimeout(resolve, 40)); }
}
app.whenReady().then(async () => {
  server = http.createServer(async (request, response) => {
    if (request.url === '/v1/models') return response.end(JSON.stringify({ data: [{ id: 'local-smoke-model' }] }));
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body).messages.at(-1).content;
    if (input === '请等待') return setTimeout(() => { if (!response.destroyed) response.end(JSON.stringify({ choices: [{ message: { content: '迟到的回复' } }] })); }, 700);
    response.end(JSON.stringify({ choices: [{ message: { content: '你好！文字聊天、会话保存和停止回应已经接通。接下来会逐步加入 Live2D 角色与语音。\n\n这条回复来自自动测试使用的本地模拟服务。' } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = structuredClone(example); config.llm.baseUrl = `http://127.0.0.1:${server.address().port}/v1`; config.llm.model = 'local-smoke-model';
  const source = path.join(root, 'config.json'), dataRoot = path.join(root, 'data'); fs.writeFileSync(source, JSON.stringify(config));
  desktop = await boot({ source, dataRoot, show: false });
  const page = expression => desktop.window.webContents.executeJavaScript(expression);
  await waitFor(() => page("!!window.desktop && document.querySelectorAll('#conversations button').length === 1"));
  assert.equal(await page("typeof window.require"), 'undefined');
  const conversations = (await page('window.desktop.bootstrap()')).value.conversations;
  const id = conversations[0].id;
  await page("document.getElementById('message-input').value='你好，介绍一下这个项目的更新进度。'; document.getElementById('message-input').dispatchEvent(new Event('input')); document.getElementById('composer').requestSubmit()");
  await waitFor(() => page("document.querySelectorAll('.assistant .message-body').length === 1 && document.querySelector('.assistant .message-body').textContent.includes('本地模拟服务')"));
  const listed = await page('window.desktop.models()'); assert.deepEqual(listed.value, ['local-smoke-model']);
  await page("document.getElementById('open-settings').click(); document.getElementById('timeout').value='65'; document.getElementById('settings-form').requestSubmit()");
  await waitFor(() => page("document.getElementById('settings-status').textContent.includes('已保存')"));
  assert.equal((await page('window.desktop.bootstrap()')).value.settings.timeoutSeconds, 65);
  await page("document.getElementById('close-settings').click()");
  const preferences = desktop.window.webContents.getLastWebPreferences();
  assert.equal(preferences.sandbox, true); assert.equal(preferences.nodeIntegration, false); assert.equal(preferences.contextIsolation, true);
  const screenshot = path.resolve(__dirname, '../../../dist/m1-preview.png'); fs.mkdirSync(path.dirname(screenshot), { recursive: true });
  await page('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await new Promise(resolve => setTimeout(resolve, 200));
  fs.writeFileSync(screenshot, (await desktop.window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  await page("document.getElementById('message-input').value='请等待'; document.getElementById('message-input').dispatchEvent(new Event('input')); document.getElementById('composer').requestSubmit()");
  await waitFor(() => page("!document.getElementById('stop').hidden"));
  await page("document.getElementById('stop').click()");
  await new Promise(resolve => setTimeout(resolve, 850));
  const messages = (await page(`window.desktop.conversation(${JSON.stringify({ conversationId: id })})`)).value.messages;
  assert.equal(messages.at(-1).status, 'cancelled'); assert.equal(messages.at(-1).content, '');
  // Model output stays text even when it contains markup.
  const injectionId = desktop.store.beginTurn(id, 'markup fixture', 'markup'); desktop.store.finish(injectionId, 'completed', '<img src=x onerror="window.injected=true">');
  await page("document.getElementById('conversations').querySelector('button').click()");
  await waitFor(() => page("document.querySelectorAll('.assistant .message-body').length === 3"));
  assert.equal(await page("document.querySelectorAll('#messages img').length"), 0);
  assert.equal(await page('!!window.injected'), false);
  desktop.window.destroy(); desktop = null;
  const reopened = await ConversationStore.open(path.join(dataRoot, 'conversations.sqlite'));
  assert.equal(reopened.get(id).messages.length, 6); reopened.close();
  console.log('Electron smoke passed: isolated preload, local reply, cancel, persistence, text rendering.');
  console.log('Preview: ' + screenshot); exitCode = 0;
}).catch(error => { console.error('Electron smoke failed: ' + error.message); }).finally(() => {
  desktop?.window.destroy(); server?.closeAllConnections(); server?.close();
  app.exit(exitCode);
});
