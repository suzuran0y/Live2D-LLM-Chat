'use strict';
function microphoneAllowed({ contents, permission, details, window, url, speech }) {
  return contents === window.webContents && contents.getURL() === url && permission === 'media'
    && ['starting', 'recording'].includes(speech.phase) && details?.isMainFrame === true
    && (Array.isArray(details.mediaTypes) ? details.mediaTypes.length > 0 && details.mediaTypes.every(type => type === 'audio') : details.mediaType === 'audio');
}
module.exports = { microphoneAllowed };
