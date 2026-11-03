/* PCM envelope measured against the audio playback clock. */
((root) => {
  'use strict';
  function prepare(buffer) {
    const stride = Math.max(1, Math.round(buffer.sampleRate / 50)), values = [];
    for (let start = 0; start < buffer.length; start += stride) {
      const end = Math.min(buffer.length, start + stride); let sum = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel); for (let index = start; index < end; index++) sum += samples[index] ** 2;
      }
      values.push(Math.sqrt(sum / ((end - start) * buffer.numberOfChannels)));
    }
    const voiced = values.filter(value => value > 0.0025).sort((a, b) => a - b);
    return { values, step: stride / buffer.sampleRate, duration: buffer.length / buffer.sampleRate, reference: Math.max(0.025, voiced[Math.floor(voiced.length * 0.85)] || 0) };
  }
  function at(envelope, seconds, volume) {
    if (!envelope || !Number.isFinite(seconds) || seconds < 0 || seconds >= envelope.duration || !Number.isFinite(volume) || volume <= 0) return 0;
    const position = seconds / envelope.step, index = Math.floor(position), mix = position - index;
    const rms = (envelope.values[index] || 0) * (1 - mix) + (envelope.values[index + 1] || 0) * mix;
    const level = Math.max(0, Math.min(1, (rms - 0.0025) / Math.max(0.001, envelope.reference - 0.0025)));
    return Math.min(0.92, Math.pow(level, 0.65) * 0.9 * Math.sqrt(Math.min(1, volume)));
  }
  const api = { prepare, at }; if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AudioEnvelope = api;
})(globalThis);
