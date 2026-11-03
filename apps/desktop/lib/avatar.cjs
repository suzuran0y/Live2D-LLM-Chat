'use strict';
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { AvatarAssets, ORIGIN } = require('./avatar-assets.cjs');
const { authorized } = require('./ipc.cjs');
const { fault, publicError } = require('./errors.cjs');
const URL = ORIGIN + '/avatar.html';

class AvatarController extends EventEmitter {
  constructor({ BrowserWindow, session, screen, ipcMain, config, chat, chatWindow, show = true }) {
    super(); Object.assign(this, { BrowserWindow, sessionFactory: session, screen, ipcMain, config, chat, chatWindow, showEnabled: show });
    this.visible = true; this.paused = false; this.suspended = false; this.phase = 'loading'; this.activity = 'idle'; this.error = null; this.channels = [];
    this.onChat = value => { this.chatActivity = value.active ? 'thinking' : value.error ? 'error' : 'idle'; this.updateActivity(); };
    chat.on('update', this.onChat);
  }
  state() { return { visible: this.visible, paused: this.paused || this.suspended, userPaused: this.paused, phase: this.phase, activity: this.activity, error: this.error }; }
  attachSpeech(speech) {
    this.speech = speech;
    this.onSpeech = value => { this.speechState = value; this.updateActivity(); };
    this.onLevel = level => { if (this.window && !this.window.isDestroyed()) this.window.webContents.send('avatar:audio', { level: this.phase === 'ready' && this.visible && !this.paused && !this.suspended ? level : 0 }); };
    speech.on('update', this.onSpeech); speech.on('level', this.onLevel);
  }
  updateActivity() {
    const phase = this.speechState?.phase;
    this.activity = ['starting', 'recording', 'decoding'].includes(phase) ? 'listening' : phase === 'playing' ? 'speaking'
      : ['transcribing', 'synthesizing', 'buffering', 'preparing'].includes(phase) ? 'thinking' : phase === 'error' ? 'error' : this.chatActivity || 'idle';
    this.publish();
  }
  publish() {
    const state = this.state();
    if (this.window && !this.window.isDestroyed()) {
      // Apply at runtime as well as construction: a covered speaking window must keep drawing.
      this.window.webContents.setBackgroundThrottling(this.showEnabled && this.activity !== 'speaking');
      this.window.webContents.send('avatar:update', state);
    }
    this.emit('update', state); return state;
  }
  async start() {
    try { await this.startWindow(); }
    catch {
      clearInterval(this.mouseTimer);
      for (const name of this.channels) this.ipcMain.removeHandler(name); this.channels = [];
      this.window?.destroy(); this.window = null;
      this.session?.protocol.unhandle('l2d'); this.session = null;
      this.phase = 'error'; this.error = 'AVATAR_RENDER'; this.publish();
    }
  }
  async startWindow() {
    try { this.assets = new AvatarAssets(this.config); }
    catch { this.phase = 'error'; this.error = 'AVATAR_RESOURCE'; this.publish(); return; }
    const area = this.screen.getPrimaryDisplay().workArea;
    const width = Math.min(380, area.width), height = Math.min(500, area.height);
    this.session = this.sessionFactory.fromPartition('avatar-' + randomUUID());
    this.session.protocol.handle('l2d', request => this.assets.response(request));
    this.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.window = new this.BrowserWindow({ width, height, x: area.x + area.width - width - 16, y: area.y + area.height - height - 16,
      minWidth: 260, minHeight: 330, transparent: true, frame: false, hasShadow: false, alwaysOnTop: true, skipTaskbar: true, show: false,
      backgroundColor: '#00000000', webPreferences: { session: this.session, preload: path.resolve(__dirname, '../avatar-preload.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: this.showEnabled },
    });
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.webContents.on('will-navigate', event => event.preventDefault());
    this.window.webContents.on('render-process-gone', () => { if (!this.disposed) { this.phase = 'error'; this.error = 'AVATAR_RENDER'; this.publish(); } });
    this.window.on('close', event => { if (!this.disposed) { event.preventDefault(); this.hide(); } });
    this.window.on('minimize', () => { this.suspended = true; this.publish(); });
    this.window.on('restore', () => { this.suspended = false; this.publish(); });
    this.register();
    this.mouseTimer = setInterval(() => this.pollMouse(), 50); this.mouseTimer.unref();
    try {
      await this.window.loadURL(URL);
      if (this.showEnabled && this.visible) this.window.showInactive();
    } catch { this.phase = 'error'; this.error = 'AVATAR_RENDER'; this.publish(); }
  }
  register() {
    const register = (name, handler) => {
      this.channels.push(name);
      this.ipcMain.handle(name, async (event, value) => {
        try {
          if (!this.window || !authorized(event, this.window.webContents, URL)) throw fault('FORBIDDEN');
          if (name !== 'avatar-view:report' && value !== undefined) throw fault('INPUT_INVALID');
          return { ok: true, value: await handler(value) };
        } catch (error) { return { ok: false, error: publicError(error) }; }
      });
    };
    register('avatar-view:state', () => this.state());
    register('avatar-view:pause', () => this.pause());
    register('avatar-view:hide', () => this.hide());
    register('avatar-view:open-chat', () => { if (!this.chatWindow.isDestroyed()) { this.chatWindow.show(); this.chatWindow.restore(); this.chatWindow.focus(); } });
    register('avatar-view:report', value => {
      if (!value || Object.keys(value).length !== 1 || !['ready', 'failed'].includes(value.type)) throw fault('INPUT_INVALID');
      this.phase = value.type === 'ready' ? 'ready' : 'error'; this.error = value.type === 'ready' ? null : this.assets.error || 'AVATAR_RENDER';
      return this.publish();
    });
  }
  pollMouse() {
    if (!this.window || this.window.isDestroyed() || !this.visible || this.paused || this.suspended || this.phase !== 'ready') return;
    const point = this.screen.getCursorScreenPoint(), bounds = this.window.getBounds(), now = Date.now();
    if (!this.lastPoint || point.x !== this.lastPoint.x || point.y !== this.lastPoint.y) this.lastMoved = now;
    this.lastPoint = point;
    const idle = now - this.lastMoved > 3000;
    const clamp = value => Math.max(-1, Math.min(1, value));
    const target = { x: idle ? 0 : clamp((point.x - bounds.x) / bounds.width * 2 - 1), y: idle ? 0 : clamp(1 - (point.y - bounds.y - 36) / (bounds.height - 36) * 2) };
    if (JSON.stringify(target) !== JSON.stringify(this.lastTarget)) { this.lastTarget = target; this.window.webContents.send('avatar:mouse', target); }
  }
  pause() { this.paused = !this.paused; return this.publish(); }
  hide() { this.visible = false; this.window?.hide(); return this.publish(); }
  async toggle() {
    if (!this.window) { this.visible = true; await this.reload(); return this.state(); }
    this.visible = !this.visible;
    if (this.visible && this.showEnabled) { this.window.restore(); this.window.showInactive(); } else if (!this.visible) this.window.hide();
    return this.publish();
  }
  async reload() {
    this.lastTarget = null;
    this.phase = 'loading'; this.error = null; this.publish();
    if (!this.window) await this.start();
    else {
      try { this.assets = new AvatarAssets(this.config); await this.window.loadURL(URL); }
      catch { this.phase = 'error'; this.error = 'AVATAR_RESOURCE'; this.publish(); }
    }
    return this.state();
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; clearInterval(this.mouseTimer); this.chat.off('update', this.onChat);
    if (this.speech) { this.speech.off('update', this.onSpeech); this.speech.off('level', this.onLevel); }
    for (const name of this.channels) this.ipcMain.removeHandler(name); this.channels = [];
    this.session?.protocol.unhandle('l2d'); this.window?.destroy(); this.window = null;
  }
}
module.exports = { AvatarController };
