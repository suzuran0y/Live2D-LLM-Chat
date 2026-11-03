(() => {
  'use strict';
  const host = window.desktop; let context, record = null, serial = 0, timer = null, lastSent = 0;
  const retired = new Set();
  function clear() {
    serial++; if (timer !== null) clearTimeout(timer); timer = null;
    if (record) { record.source.onended = null; try { record.source.stop(); } catch {} record.source.disconnect(); record.gain.disconnect(); }
    record = null;
  }
  function update() {
    if (!record) return;
    const seconds = context.currentTime - record.startAt - (context.outputLatency || 0);
    const level = context.state === 'running' ? AudioEnvelope.at(record.envelope, seconds, record.volume) : 0;
    if (performance.now() - lastSent >= 30) { lastSent = performance.now(); void host.speechLevel({ playbackId: record.playbackId, level }); }
    // Sample the audio clock independently of a hidden window's compositor frames.
    timer = setTimeout(update, 33);
  }
  host.onSpeechStop(value => {
    retired.add(value.playbackId); if (retired.size > 32) retired.delete(retired.values().next().value);
    if (!record || record.playbackId === value.playbackId) clear();
    void host.speechPlayer({ playbackId: value.playbackId, type: 'stopped' });
  });
  host.onSpeechAudio(async value => {
    if (retired.has(value.playbackId)) return;
    clear(); const generation = serial;
    try {
      context ||= new AudioContext(); const bytes = new Uint8Array(value.audio);
      const buffer = await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      if (generation !== serial || retired.has(value.playbackId)) return;
      await context.resume(); if (generation !== serial) return;
      const source = context.createBufferSource(), gain = context.createGain(); source.buffer = buffer; gain.gain.value = value.volume;
      source.connect(gain).connect(context.destination);
      record = { source, gain, playbackId: value.playbackId, volume: value.volume, envelope: AudioEnvelope.prepare(buffer), startAt: context.currentTime };
      source.onended = () => { if (generation !== serial) return; clear(); void host.speechPlayer({ playbackId: value.playbackId, index: value.index, type: 'ended' }); };
      source.start(); await host.speechPlayer({ playbackId: value.playbackId, index: value.index, type: 'started' });
      if (generation === serial) update();
    } catch { if (generation === serial) { clear(); void host.speechPlayer({ playbackId: value.playbackId, index: value.index, type: 'failed' }); } }
  });
  window.addEventListener('pagehide', () => { clear(); void context?.close(); });
  window.audioOutput = { get state() { return { playing: !!record, playbackId: record?.playbackId || null, contextState: context?.state || 'not-created' }; } };
})();
