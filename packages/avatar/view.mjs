import { AvatarRenderer } from './renderer.mjs';
const host = window.avatarHost, renderer = new AvatarRenderer(document.getElementById('avatar'));
let frame = null, lifecycle = { paused: false, visible: true, activity: 'idle' }, initialized = false, lastError = null;
const stateLabels = { idle: '待机', thinking: '思考中', error: '回应未完成', listening: '倾听中', speaking: '说话中' };
function draw(now) {
  frame = null;
  try { renderer.render(now); } catch (error) { fail(error); return; }
  if (!renderer.driver.paused && !renderer.disposed) frame = requestAnimationFrame(draw);
}
function apply(value) {
  const wasSpeaking = lifecycle.activity === 'speaking';
  lifecycle = value; renderer.driver.setState(value.activity);
  const paused = value.paused || !value.visible;
  renderer.driver.setPaused(paused);
  document.getElementById('status').textContent = value.phase === 'error' ? '角色未就绪' : paused ? '已暂停' : stateLabels[value.activity] || '待机';
  document.getElementById('pause').textContent = value.userPaused ? '继续' : '暂停';
  if (!initialized) return;
  if (paused) { if (frame !== null) cancelAnimationFrame(frame); frame = null; renderer.render(performance.now(), true); }
  else {
    if (wasSpeaking && value.activity !== 'speaking') renderer.render(performance.now(), true);
    if (frame === null) { renderer.last = 0; frame = requestAnimationFrame(draw); }
  }
}
function fail(error) {
  lastError = error?.message || '角色渲染未完成'; console.error(lastError);
  if (frame !== null) cancelAnimationFrame(frame); frame = null; renderer.dispose();
  document.getElementById('error').hidden = false; document.getElementById('error').textContent = '角色渲染未完成。你可以继续聊天，或在聊天窗口重试角色。';
  void host.report({ type: 'failed' });
}
host.onUpdate(apply);
host.onMouse(value => renderer.driver.setMouse(value.x, value.y));
host.onAudio(value => {
  renderer.driver.setAudioLevel(value.level);
  // Hidden/covered windows can deliver rAF too slowly for speech. Audio ticks request
  // the same renderer; its 30 FPS gate still controls all parameter writes.
  if (initialized && !renderer.driver.paused && !renderer.disposed && lifecycle.activity === 'speaking') {
    try { renderer.render(performance.now()); } catch (error) { fail(error); }
  }
});
document.getElementById('pause').addEventListener('click', () => void host.pause());
document.getElementById('hide').addEventListener('click', () => void host.hide());
document.getElementById('open-chat').addEventListener('click', () => void host.openChat());
renderer.canvas.addEventListener('pointerdown', () => renderer.driver.triggerBlink());
window.addEventListener('pagehide', () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; renderer.dispose(); });
renderer.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(); });
new ResizeObserver(() => { if (renderer.ready) renderer.render(performance.now(), true); }).observe(renderer.canvas);
window.avatarView = { stats: () => ({ ...renderer.stats(), error: lastError }) };
try {
  await renderer.load(); initialized = true;
  const result = await host.state(); if (result.ok) apply(result.value);
  await host.report({ type: 'ready' });
} catch (error) { fail(error); }
