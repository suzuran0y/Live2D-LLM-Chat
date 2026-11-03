'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const invoke = name => payload => ipcRenderer.invoke('avatar-view:' + name, payload);
const subscribe = channel => callback => { const listener = (_event, value) => callback(value); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('avatarHost', Object.freeze({
  state: invoke('state'), pause: invoke('pause'), hide: invoke('hide'), openChat: invoke('open-chat'), report: invoke('report'),
  onUpdate: subscribe('avatar:update'), onMouse: subscribe('avatar:mouse'), onAudio: subscribe('avatar:audio'),
}));
