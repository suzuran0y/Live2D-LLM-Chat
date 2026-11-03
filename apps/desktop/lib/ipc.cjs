'use strict';
const { fault, publicError } = require('./errors.cjs');
const ID = /^[a-f0-9-]{36}$/u;
function objectWith(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function validId(value) { return typeof value === 'string' && ID.test(value); }
function authorized(event, contents, url) {
  return event.sender === contents && event.senderFrame === contents.mainFrame && event.senderFrame?.url === url;
}
function registerIpc({ ipcMain, window, url, store, config, model, chat, avatar, speech, history, resources }) {
  const channels = [];
  function register(name, validate, handler) {
    channels.push(name);
    ipcMain.handle(name, async (event, payload) => {
      try {
        if (!authorized(event, window.webContents, url)) throw fault('FORBIDDEN');
        if (!validate(payload)) throw fault('INPUT_INVALID');
        return { ok: true, value: await handler(payload) };
      } catch (error) { return { ok: false, error: publicError(error) }; }
    });
  }
  const empty = value => value === undefined;
  const conversation = value => objectWith(value, ['conversationId']) && validId(value.conversationId);
  const snapshot = () => ({ conversations: store.list(), settings: config.llm(), ...chat.state(), avatar: avatar?.state() || null, speech: speech?.state() || null });
  register('app:bootstrap', empty, snapshot);
  register('conversation:create', empty, () => store.create());
  register('conversation:get', conversation, value => store.get(value.conversationId));
  register('chat:send', value => objectWith(value, ['conversationId', 'text']) && validId(value.conversationId)
    && typeof value.text === 'string' && value.text.trim().length > 0 && value.text.length <= 12000,
  async value => { await speech?.stop(); return chat.send(value); });
  register('chat:cancel', conversation, async value => { try { await speech?.stop(); } finally { chat.cancel(value.conversationId); } return chat.state(); });
  register('settings:save', value => objectWith(value, ['baseUrl', 'model', 'timeoutSeconds', 'contextTokens']), value => {
    if (chat.active) throw fault('BUSY'); return config.save(value);
  });
  register('models:list', empty, () => model.models(config.llm()));
  if (history) {
    register('history:preview', empty, () => history.preview());
    register('history:commit', value => objectWith(value, ['token']) && validId(value.token), value => history.commit(value.token));
  }
  if (resources) {
    register('resources:preview', empty, () => resources.preview());
    register('resources:install', value => objectWith(value, ['token']) && validId(value.token), value => resources.install(value.token));
    register('resources:link', value => objectWith(value, ['kind']) && ['cosyvoice3', 'asr-python'].includes(value.kind), value => resources.link(value.kind));
  }
  if (avatar) {
    register('avatar:toggle', empty, () => avatar.toggle());
    register('avatar:pause', empty, () => avatar.pause());
    register('avatar:reload', empty, () => avatar.reload());
  }
  if (speech) {
    register('speech:focus', conversation, value => speech.focus(value.conversationId));
    register('speech:record', conversation, value => speech.record(value.conversationId));
    register('speech:finish', empty, () => speech.finishRecording());
    register('speech:stop', empty, () => speech.stop());
    register('speech:settings', value => objectWith(value, ['enabled', 'volume']), value => speech.save(value));
    register('voice:settings', value => objectWith(value, ['backend', 'profileId', 'stream']), value => speech.saveVoice(value));
    register('voice:reload', empty, () => speech.reloadVoice());
    register('voice:preview', empty, () => speech.auditionVoice());
    register('voice:import', value => objectWith(value, ['name', 'text']), value => speech.importVoice(value));
    register('voice:prepare', value => objectWith(value, ['profileId']) && typeof value.profileId === 'string', value => speech.prepareVoice(value.profileId));
    register('speech:capture', value => value && validId(value.id)
      && (value.type === 'started' && objectWith(value, ['id', 'type'])
        || value.type === 'error' && objectWith(value, ['id', 'type', 'code']) && ['short', 'permission', 'device'].includes(value.code)
        || value.type === 'audio' && objectWith(value, ['id', 'type', 'audio']) && value.audio instanceof Uint8Array && value.audio.byteLength <= 1920044), value => speech.capture(value));
    register('speech:player', value => value && validId(value.playbackId)
      && (value.type === 'stopped' && objectWith(value, ['playbackId', 'type'])
        || ['started', 'ended', 'failed'].includes(value.type) && objectWith(value, ['playbackId', 'type', 'index']) && Number.isInteger(value.index) && value.index >= 0 && value.index <= 127), value => speech.player(value));
    register('speech:level', value => objectWith(value, ['playbackId', 'level']) && typeof value.playbackId === 'string'
      && value.playbackId.length <= 100 && Number.isFinite(value.level) && value.level >= 0 && value.level <= 1, value => speech.level(value));
  }
  const update = value => { if (!window.isDestroyed()) window.webContents.send('chat:update', value); };
  chat.on('update', update);
  const avatarUpdate = value => { if (!window.isDestroyed()) window.webContents.send('avatar:update', value); };
  avatar?.on('update', avatarUpdate);
  const speechListeners = [];
  if (speech) for (const [event, channel] of [['update', 'speech:update'], ['capture', 'speech:capture'], ['transcript', 'speech:transcript'], ['audio', 'speech:audio'], ['stop', 'speech:stop']]) {
    const listener = value => { if (!window.isDestroyed()) window.webContents.send(channel, value); };
    speech.on(event, listener); speechListeners.push([event, listener]);
  }
  return () => { chat.off('update', update); avatar?.off('update', avatarUpdate); for (const [event, listener] of speechListeners) speech.off(event, listener); for (const name of channels) ipcMain.removeHandler(name); };
}
module.exports = { registerIpc, authorized };
