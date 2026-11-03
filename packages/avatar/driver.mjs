// Capability-based driver adapted from Cute-Partner's driver/state composition.
// It returns normalized targets; only the renderer writes model parameters.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
export const PARAM_MODES = Object.freeze({
  ParamEyeBallX: 'signed', ParamEyeBallY: 'signed', ParamAngleX: 'signed', ParamAngleY: 'signed', ParamAngleZ: 'signed',
  ParamBodyAngleX: 'signed', ParamBodyAngleY: 'signed', ParamBodyAngleZ: 'signed',
  ParamEyeLOpen: 'unit', ParamEyeROpen: 'unit', ParamBreath: 'unit', ParamMouthOpenY: 'unit',
  ParamBrowLY: 'signed', ParamBrowRY: 'signed',
});
export function adaptParameters(targets, entries) {
  const result = {};
  for (const [id, entry] of entries) {
    if (!Object.hasOwn(targets, id) || !Object.hasOwn(PARAM_MODES, id)) continue;
    const level = clamp(targets[id], -1, 1);
    const value = PARAM_MODES[id] === 'unit' ? entry.min + clamp(level, 0, 1) * (entry.max - entry.min)
      : entry.default + level * (level >= 0 ? entry.max - entry.default : entry.default - entry.min);
    result[id] = clamp(value, entry.min, entry.max);
  }
  return result;
}
export class AvatarDriver {
  constructor(random = Math.random) {
    this.random = random; this.time = 0; this.target = { x: 0, y: 0 }; this.eye = { x: 0, y: 0 };
    this.head = { x: 0, y: 0 }; this.state = 'idle'; this.paused = false; this.blinkAge = null;
    this.weights = { thinking: 0, error: 0, listening: 0, speaking: 0 };
    this.audioLevel = 0; this.mouth = 0;
    this.nextBlink = 2 + random() * 3; this.values = {}; this.update(0);
  }
  setMouse(x, y) { this.target = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }; }
  setState(state) { if (['idle', 'thinking', 'error', 'listening', 'speaking'].includes(state)) { this.state = state; if (state !== 'speaking') this.setAudioLevel(0); } }
  setAudioLevel(value) { this.audioLevel = this.paused ? 0 : clamp(value, 0, 1); if (!this.audioLevel) { this.mouth = 0; this.values.ParamMouthOpenY = 0; } }
  setPaused(paused) { this.paused = !!paused; if (this.paused) this.setAudioLevel(0); }
  triggerBlink() { if (this.blinkAge === null) this.blinkAge = 0; }
  update(delta) {
    if (this.paused) return this.values;
    const dt = clamp(delta, 0, 0.05); this.time += dt;
    for (const axis of ['x', 'y']) {
      this.eye[axis] += (this.target[axis] - this.eye[axis]) * (1 - Math.exp(-dt / 0.13));
      this.head[axis] += (this.target[axis] - this.head[axis]) * (1 - Math.exp(-dt / 0.35));
    }
    if (this.blinkAge === null && this.time >= this.nextBlink) this.triggerBlink();
    let open = 1;
    if (this.blinkAge !== null) {
      this.blinkAge += dt; const t = this.blinkAge;
      open = t < 0.09 ? 1 - t / 0.09 : t < 0.14 ? 0 : t < 0.30 ? (t - 0.14) / 0.16 : 1;
      if (t >= 0.30) { this.blinkAge = null; this.nextBlink = this.time + 2.8 + this.random() * 3.2; }
    }
    for (const key of Object.keys(this.weights)) this.weights[key] += ((this.state === key ? 1 : 0) - this.weights[key]) * (1 - Math.exp(-dt / 0.2));
    const { thinking, error, listening, speaking } = this.weights;
    const mouthTarget = this.state === 'speaking' ? this.audioLevel : 0;
    this.mouth += (mouthTarget - this.mouth) * (1 - Math.exp(-dt / (mouthTarget > this.mouth ? 0.035 : 0.07)));
    this.values = {
      ParamEyeBallX: this.eye.x, ParamEyeBallY: this.eye.y,
      ParamAngleX: this.head.x * 0.65, ParamAngleY: this.head.y * 0.5 - error * 0.08 + listening * 0.04 + speaking * Math.sin(this.time * 3.2) * 0.025,
      ParamAngleZ: -this.head.x * 0.3 + thinking * 0.16 + error * -0.13,
      ParamBodyAngleX: this.head.x * 0.2, ParamBodyAngleY: this.head.y * 0.12, ParamBodyAngleZ: this.head.x * -0.1,
      ParamEyeLOpen: open, ParamEyeROpen: open, ParamBreath: (1 - Math.cos(this.time * Math.PI * 2 / 4.4)) * 0.4,
      ParamBrowLY: thinking * 0.12 + error * 0.15, ParamBrowRY: thinking * -0.04,
      ParamMouthOpenY: this.mouth,
    };
    return this.values;
  }
}
