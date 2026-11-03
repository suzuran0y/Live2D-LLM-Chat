(() => {
  'use strict';
  const host = window.desktop; let current = null;
  function dispose(op) { clearTimeout(op.timer); op.stream?.getTracks().forEach(track => track.stop()); }
  async function wave(blob, op) {
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const frames = Math.min(60 * 16000, Math.floor(decoded.duration * 16000));
      if (frames < 6400) throw Error('short');
      const offline = new OfflineAudioContext(1, frames, 16000), source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
      const rendered = await offline.startRendering(); if (current !== op) return null;
      const output = new ArrayBuffer(44 + frames * 2), view = new DataView(output);
      const text = (offset, value) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
      text(0, 'RIFF'); view.setUint32(4, output.byteLength - 8, true); text(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * 2, true);
      const samples = rendered.getChannelData(0); for (let index = 0; index < frames; index++) { const value = Math.max(-1, Math.min(1, samples[index])); view.setInt16(44 + index * 2, value < 0 ? value * 32768 : value * 32767, true); }
      return new Uint8Array(output);
    } finally { await context.close(); }
  }
  host.onSpeechCapture(async value => {
    if (value.action === 'cancel') { if (current?.id === value.id) { const op = current; current = null; if (op.recorder?.state === 'recording') op.recorder.stop(); dispose(op); } return; }
    if (value.action === 'stop') { if (current?.id === value.id && current.recorder?.state === 'recording') current.recorder.stop(); return; }
    if (value.action !== 'start') return;
    const op = current = { id: value.id, chunks: [], size: 0 };
    try {
      const stream = op.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (current !== op) { dispose(op); return; }
      const recorder = op.recorder = new MediaRecorder(stream);
      recorder.ondataavailable = event => { op.size += event.data.size; if (op.size > 4000000) { void host.speechCapture({ id: op.id, type: 'error', code: 'device' }); if (recorder.state === 'recording') recorder.stop(); } else if (event.data.size) op.chunks.push(event.data); };
      recorder.onerror = () => { if (current === op) { current = null; void host.speechCapture({ id: op.id, type: 'error', code: 'device' }); } dispose(op); };
      recorder.onstop = async () => {
        dispose(op); if (current !== op) return;
        try { const audio = await wave(new Blob(op.chunks, { type: recorder.mimeType }), op); if (audio && current === op) { current = null; await host.speechCapture({ id: op.id, type: 'audio', audio }); } }
        catch (error) { if (current === op) { current = null; void host.speechCapture({ id: op.id, type: 'error', code: error.message === 'short' ? 'short' : 'device' }); } }
      };
      recorder.start(250); op.timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, value.maxSeconds * 1000);
      await host.speechCapture({ id: op.id, type: 'started' });
    } catch { dispose(op); if (current === op) { current = null; void host.speechCapture({ id: op.id, type: 'error', code: 'permission' }); } }
  });
  window.addEventListener('pagehide', () => { if (current) { const op = current; current = null; dispose(op); if (op.recorder?.state === 'recording') op.recorder.stop(); } });
})();
