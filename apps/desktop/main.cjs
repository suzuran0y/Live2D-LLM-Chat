'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, protocol, session, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ConfigStore } = require('./lib/config.cjs');
const { ConversationStore } = require('./lib/store.cjs');
const { LocalModel } = require('./lib/model.cjs');
const { ChatService } = require('./lib/chat.cjs');
const { registerIpc } = require('./lib/ipc.cjs');
const { publicError } = require('./lib/errors.cjs');
const { AvatarController } = require('./lib/avatar.cjs');
const { SpeechService } = require('./lib/speech.cjs');
const { microphoneAllowed } = require('./lib/media-permission.cjs');
const { HistoryImport } = require('./lib/history-import.cjs');
const { ResourceManager } = require('./lib/resource-links.cjs');
const { AsrBackend } = require('./lib/speech-backends.cjs');
const { CosyVoiceBackend } = require('./lib/cosyvoice.cjs');
const ROOT = path.resolve(__dirname, '../..');
protocol.registerSchemesAsPrivileged([{ scheme: 'l2d', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

async function boot({ dataRoot = app.getPath('userData'), source, show = true, speechOptions = {}, pickers = {} } = {}) {
  const local = path.join(ROOT, 'configs/v2.local.json');
  source ||= process.env.LIVE2D_CONFIG || (fs.existsSync(local) ? local : path.join(ROOT, 'configs/v2.example.json'));
  const config = new ConfigStore({ source, dataRoot });
  const store = await ConversationStore.open(path.join(dataRoot, 'conversations.sqlite'));
  const model = new LocalModel(), chat = new ChatService({ store, config, model });
  const window = new BrowserWindow({ width: 1140, height: 800, minWidth: 850, minHeight: 620,
    show: false, title: 'Live2D LLM Chat', backgroundColor: '#f7f8f5',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: show, autoplayPolicy: 'no-user-gesture-required' },
  });
  Menu.setApplicationMenu(null);
  const html = path.join(__dirname, 'ui/index.html'), url = pathToFileURL(html).href;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const speech = new SpeechService({ config, chat, store, dataRoot, chooseVoice: async () => {
    const value = await dialog.showOpenDialog(window, { title: '选择3–30秒参考录音', properties: ['openFile'], filters: [{ name: 'PCM WAV', extensions: ['wav'] }] });
    return value.canceled ? null : value.filePaths[0];
  }, ...speechOptions });
  const permission = (contents, value, details) => microphoneAllowed({ contents, permission: value, details, window, url, speech });
  window.webContents.session.setPermissionRequestHandler((contents, value, callback, details) => callback(permission(contents, value, details)));
  window.webContents.session.setPermissionCheckHandler((contents, value, _origin, details) => permission(contents, value, details));
  const background = state => window.webContents.setBackgroundThrottling(show && !state.active);
  speech.on('update', background);
  const avatar = new AvatarController({ BrowserWindow, session, screen, ipcMain, config, chat, chatWindow: window, show });
  avatar.attachSpeech(speech);
  const choose = async (title, directory = false, extensions = ['txt']) => {
    const result = await dialog.showOpenDialog(window, { title, properties: [directory ? 'openDirectory' : 'openFile'], ...(directory ? {} : { filters: [{ name: title, extensions }] }) }); return result.canceled ? null : result.filePaths[0];
  };
  const busy = () => !!chat.active || !!speech.current || speech.closed;
  const history = new HistoryImport({ store, busy, chooseFile: pickers.history || (() => choose('选择旧版历史记录')) });
  const resources = new ResourceManager({ dataRoot, config, busy,
    choosePack: pickers.resourcePack || (() => choose('选择包含 resource.json 的资源包目录', true)),
    chooseCosy: pickers.cosyvoice || (() => choose('选择包含 source、model、venv 的 CosyVoice3 目录', true)),
    choosePython: pickers.asrPython || (() => choose('选择 ASR Python 解释器', false, ['exe'])),
    apply: async value => {
      if (busy()) throw require('./lib/errors.cjs').fault('BUSY');
      await speech.stop(); await speech.asr.stop(); await speech.natural.stop(); config.saveResources(value);
      speech.asr = new AsrBackend(config); speech.natural = new CosyVoiceBackend(config, speech.profiles); speech.publish(); await avatar.reload();
    },
  });
  const unregister = registerIpc({ ipcMain, window, url, store, config, model, chat, avatar, speech, history, resources });
  let closed = false;
  let closing = false;
  window.on('close', event => {
    if (closing) return; event.preventDefault(); closing = true;
    try { chat.close(); } catch {}
    void speech.close().catch(() => {}).finally(() => { if (!window.isDestroyed()) window.destroy(); });
  });
  window.on('closed', () => {
    if (closed) return; closed = true;
    speech.off('update', background); void speech.close().catch(() => {});
    avatar.dispose();
    try { chat.close(); } catch { /* A storage failure is recovered as interrupted on next startup. */ }
    unregister(); store.close();
  });
  await window.loadFile(html);
  await avatar.start();
  if (show) window.show();
  return { window, store, chat, config, avatar, speech, history, resources };
}

if (require.main === module) {
  app.setName('Live2D-LLM-Chat');
  if (process.env.LIVE2D_USER_DATA && path.isAbsolute(process.env.LIVE2D_USER_DATA)) app.setPath('userData', process.env.LIVE2D_USER_DATA);
  if (!app.requestSingleInstanceLock()) app.quit();
  else {
    app.whenReady().then(() => boot({ show: process.env.LIVE2D_TEST_HIDDEN !== '1' })).catch(error => { dialog.showErrorBox('启动未完成', publicError(error).message); app.quit(); });
    app.on('window-all-closed', () => app.quit());
    app.on('second-instance', () => { const window = BrowserWindow.getAllWindows()[0]; if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  }
}
module.exports = { boot };
