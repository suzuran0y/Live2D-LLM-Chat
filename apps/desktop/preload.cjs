'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const invoke = channel => payload => ipcRenderer.invoke(channel, payload);
const subscribe = channel => callback => { const listener = (_event, value) => callback(value); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  bootstrap: invoke('app:bootstrap'), createConversation: invoke('conversation:create'),
  conversation: invoke('conversation:get'), send: invoke('chat:send'), cancel: invoke('chat:cancel'),
  saveSettings: invoke('settings:save'), models: invoke('models:list'),
  previewHistory: invoke('history:preview'), importHistory: invoke('history:commit'),
  previewResources: invoke('resources:preview'), installResources: invoke('resources:install'), linkResources: invoke('resources:link'),
  toggleAvatar: invoke('avatar:toggle'), pauseAvatar: invoke('avatar:pause'), reloadAvatar: invoke('avatar:reload'),
  speechFocus: invoke('speech:focus'), recordSpeech: invoke('speech:record'), finishSpeech: invoke('speech:finish'), stopSpeech: invoke('speech:stop'),
  saveSpeech: invoke('speech:settings'), speechCapture: invoke('speech:capture'), speechPlayer: invoke('speech:player'), speechLevel: invoke('speech:level'),
  saveVoice: invoke('voice:settings'), reloadVoice: invoke('voice:reload'), previewVoice: invoke('voice:preview'), importVoice: invoke('voice:import'), prepareVoice: invoke('voice:prepare'),
  onSpeechUpdate: subscribe('speech:update'), onSpeechCapture: subscribe('speech:capture'), onTranscript: subscribe('speech:transcript'), onSpeechAudio: subscribe('speech:audio'), onSpeechStop: subscribe('speech:stop'),
  onAvatarUpdate(callback) {
    const listener = (_event, value) => callback(value); ipcRenderer.on('avatar:update', listener);
    return () => ipcRenderer.removeListener('avatar:update', listener);
  },
  onUpdate(callback) {
    const listener = (_event, value) => callback(value); ipcRenderer.on('chat:update', listener);
    return () => ipcRenderer.removeListener('chat:update', listener);
  },
}));
