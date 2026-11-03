'use strict';
const { app } = require('electron'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const { boot } = require('../main.cjs'), { buildResource } = require('../../../tools/build-resource-pack.cjs');
const ROOT = path.resolve(__dirname, '../../..'), root = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-m5-window-')); fs.mkdirSync(path.join(root, 'electron')); app.setPath('userData', path.join(root, 'electron')); app.on('window-all-closed', () => {});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, timeout = 20000) { const start = Date.now(); while (!await check()) { if (Date.now() - start > timeout) throw Error('M5 window timeout'); await delay(40); } }
let desktop, server, code = 1;
app.whenReady().then(async () => {
  const packet = await buildResource('avatar', path.join(root, 'packet')), historyFile = path.join(root, 'old.txt'); fs.writeFileSync(historyFile, 'Time：2025-02-28 04:00:00\nUser：LEGACY_ARCHIVE_ONLY\nNeko：旧回复\n---\n');
  let received;
  server = http.createServer(async (request, response) => { let data = ''; for await (const bytes of request) data += bytes; received = JSON.parse(data); response.end(JSON.stringify({ choices: [{ message: { content: '新的独立回复' } }] })); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = require('../../../configs/v2.example.json'); config.resources.legacyRoot = ROOT; config.llm.model = 'm5-fixture'; config.llm.baseUrl = `http://127.0.0.1:${server.address().port}/v1`; const source = path.join(root, 'config.json'); fs.writeFileSync(source, JSON.stringify(config));
  desktop = await boot({ source, dataRoot: path.join(root, 'data'), show: false, pickers: { history: async () => historyFile, resourcePack: async () => packet } });
  const page = expression => desktop.window.webContents.executeJavaScript(expression); await waitFor(() => desktop.speech.focused && desktop.avatar.phase === 'ready');
  await page("document.getElementById('open-history').click(); void 0;"); await waitFor(() => page("!document.getElementById('history-confirm').disabled"));
  assert.equal(desktop.store.list().length, 1); await page("document.getElementById('history-confirm').click(); void 0;"); await waitFor(() => desktop.store.list().length === 2); await page("document.getElementById('history-close').click(); void 0;");
  await waitFor(() => page("document.getElementById('messages').textContent.includes('不参与模型上下文')"));
  await page("document.getElementById('message-input').value='新的问题'; document.getElementById('message-input').dispatchEvent(new Event('input')); document.getElementById('composer').requestSubmit(); void 0;"); await waitFor(() => page("document.getElementById('messages').textContent.includes('新的独立回复')"));
  assert.ok(!JSON.stringify(received).includes('LEGACY_ARCHIVE_ONLY')); assert.equal(fs.readFileSync(historyFile, 'utf8').includes('LEGACY_ARCHIVE_ONLY'), true);
  await page("document.getElementById('open-resources').click(); document.getElementById('resources-choose').click(); void 0;"); await waitFor(() => page("!document.getElementById('resources-confirm').disabled"));
  await page("document.getElementById('resources-confirm').click(); void 0;"); await waitFor(() => desktop.config.config.resources.avatarRoot && desktop.avatar.phase === 'ready'); await waitFor(() => page("document.getElementById('resources-status').textContent.includes('已安装')"));
  const output = path.join(ROOT, 'dist/m5-maintenance-preview.png'); fs.writeFileSync(output, (await desktop.window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  assert.ok(fs.existsSync(path.join(root, 'data/resource-settings.json'))); desktop.window.close(); await waitFor(() => desktop.window.isDestroyed()); desktop = null;
  desktop = await boot({ source, dataRoot: path.join(root, 'data'), show: false }); await waitFor(() => desktop.avatar.phase === 'ready'); assert.equal(desktop.store.list().length, 2);
  desktop.window.close(); await waitFor(() => desktop.window.isDestroyed()); desktop = null;
  console.log('M5 window passed: history preview/import, archive isolation, backup, resource preview/install, activation and restart.'); console.log('Preview: ' + output); code = 0;
}).catch(error => console.error(error.stack)).finally(async () => { if (desktop) { await desktop.speech.close().catch(() => {}); desktop.window.destroy(); } server?.closeAllConnections(); server?.close(); app.exit(code); });
