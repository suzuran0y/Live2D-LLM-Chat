(() => {
  'use strict';
  const api = window.desktop, $ = id => document.getElementById(id);
  let currentId = null, settings = null, active = null, revision = 0, sending = false;
  let speech = null;
  const drafts = new Map();
  async function call(promise) { const result = await promise; if (!result.ok) throw new Error(result.error.message); return result.value; }
  function notice(text = '') { $('notice').textContent = text; $('notice').hidden = !text; }
  function avatarControls(value) {
    if (!value) return;
    $('avatar-status').textContent = value.phase === 'error' ? '角色未就绪，聊天可继续' : value.phase === 'loading' ? '角色加载中' : !value.visible ? '角色已隐藏' : value.paused ? '角色已暂停' : ({ thinking: '角色正在思考', listening: '角色正在聆听', speaking: '角色正在说话' }[value.activity] || '角色待机');
    $('avatar-toggle').textContent = value.visible ? '隐藏角色' : '显示角色';
    $('avatar-pause').textContent = value.userPaused ? '继续' : '暂停';
    $('avatar-reload').hidden = value.phase !== 'error';
  }
  function controls() {
    $('send').disabled = sending || !!active || !$('message-input').value.trim();
    $('stop').hidden = active?.conversationId !== currentId && !(speech?.active && speech.conversationId === currentId);
    $('open-settings').disabled = !!active; $('model-indicator').disabled = !!active;
    $('input-hint').textContent = active ? '正在生成回复；可以停止后重新发送。' : 'Enter 发送 · Shift + Enter 换行 · F8 录音';
    if (speech) {
      $('record').disabled = !speech.asrAvailable || ['starting', 'decoding', 'transcribing', 'stopping'].includes(speech.phase);
      $('record').textContent = speech.phase === 'recording' ? '结束录音并发送' : '录音并发送';
      const capture = ['starting', 'recording', 'decoding', 'transcribing'].includes(speech.phase);
      $('read-replies').disabled = capture; $('speech-volume').disabled = capture;
      $('open-voice').disabled = capture;
    }
  }
  function renderMessages(conversation) {
    $('conversation-title').textContent = conversation.title;
    const box = $('messages'), nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
    box.replaceChildren();
    if (!conversation.messages.length) {
      const empty = document.createElement('div'); empty.className = 'empty';
      const mark = document.createElement('div'); mark.className = 'empty-mark'; mark.textContent = 'L2';
      const title = document.createElement('h2'); title.textContent = '从一句话开始';
      const description = document.createElement('p'); description.textContent = '连接 LM Studio，让交流留在本机。\n每一段对话都会自动保存。';
      const button = document.createElement('button'); button.textContent = '设置本地连接'; button.addEventListener('click', openSettings);
      empty.append(mark, title, description, button); box.append(empty); return;
    }
    for (const message of conversation.messages) {
      const article = document.createElement('article'); article.className = 'message ' + message.role;
      const label = document.createElement('div'); label.className = 'message-label'; label.textContent = message.role === 'user' ? '你' : '本地助手';
      const body = document.createElement('div'); body.className = 'message-body';
      body.textContent = message.content || ({ pending: '正在生成…', cancelled: '本次回复已停止。', error: '本次回复未完成，可以重新发送。' }[message.status] || '');
      article.append(label, body);
      if (message.status === 'imported') { const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = '旧版存档 · 不参与模型上下文'; article.append(meta); }
      if (message.status === 'cancelled' || message.status === 'error') { const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = message.status === 'cancelled' ? '已取消' : '未完成'; article.append(meta); }
      box.append(article);
    }
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }
  async function refresh() {
    const version = ++revision;
    const snapshot = await call(api.bootstrap()); if (version !== revision) return;
    settings = snapshot.settings; active = snapshot.active;
    if (snapshot.speech) speechControls(snapshot.speech);
    avatarControls(snapshot.avatar);
    $('model-indicator').textContent = settings.model || '尚未设置模型';
    if (!currentId && snapshot.conversations.length) currentId = snapshot.conversations[0].id;
    const list = $('conversations'); list.replaceChildren();
    for (const conversation of snapshot.conversations) {
      const button = document.createElement('button'); button.textContent = conversation.title;
      button.title = conversation.title; button.className = conversation.id === currentId ? 'selected' : '';
      button.addEventListener('click', () => select(conversation.id)); list.append(button);
    }
    if (currentId) {
      const conversation = await call(api.conversation({ conversationId: currentId }));
      if (version !== revision) return; renderMessages(conversation);
    }
    controls();
  }
  async function select(id) {
    if (currentId) drafts.set(currentId, $('message-input').value);
    await call(api.speechFocus({ conversationId: id }));
    currentId = id; $('message-input').value = drafts.get(id) || ''; notice();
    try { await refresh(); } catch (error) { notice(error.message); }
  }
  async function create() {
    try { const conversation = await call(api.createConversation()); await select(conversation.id); $('message-input').focus(); }
    catch (error) { notice(error.message); }
  }
  function openSettings() {
    if (!settings || active) return;
    $('base-url').value = settings.baseUrl; $('model-name').value = settings.model;
    $('timeout').value = settings.timeoutSeconds; $('context-tokens').value = settings.contextTokens;
    $('settings-status').textContent = ''; $('settings-dialog').showModal();
  }
  $('new-conversation').addEventListener('click', create);
  window.addEventListener('history-imported', event => { void select(event.detail).catch(error => notice(error.message)); });
  function speechControls(value) {
    speech = value; $('read-replies').checked = value.settings.enabled; $('speech-volume').value = value.settings.volume;
    const labels = { starting: '正在请求麦克风…', recording: '正在录音，结束后识别并发送', decoding: '正在处理录音…', transcribing: '本地识别中，首次加载可能较慢…', preparing: '正在加载语音或制作音色…', synthesizing: '正在准备声音…', buffering: '正在准备播放…', playing: '正在朗读…', stopping: '正在停止…' };
    const voice = value.voice || (value.voiceSettings?.backend === 'cosyvoice3' ? 'CosyVoice3' : '系统默认声线');
    $('speech-status').textContent = value.error?.message || labels[value.phase] || (value.settings.enabled ? voice + (value.truncated ? ' · 已朗读前600字' : '') : '回复朗读未启用');
    if (value.fallback && !value.error) $('speech-status').textContent += ' · 本次使用系统语音';
    if (!value.asrAvailable && value.phase === 'idle') $('speech-status').textContent += ' · 本地识别未准备';
    voiceControls(value); controls();
  }
  api.onSpeechUpdate(speechControls);
  api.onTranscript(value => { if (!value.sent) { drafts.set(value.conversationId, value.text); if (value.conversationId === currentId) { $('message-input').value = value.text; controls(); } } });
  $('record').addEventListener('click', async () => { try { if (speech?.phase === 'recording') await call(api.finishSpeech()); else await call(api.recordSpeech({ conversationId: currentId })); } catch (error) { notice(error.message); } });
  window.addEventListener('keydown', event => {
    if (event.key === 'F8' && !event.repeat && !document.querySelector('dialog[open]') && !$('record').disabled) { event.preventDefault(); $('record').click(); }
  });
  const saveSpeech = async () => { try { speechControls(await call(api.saveSpeech({ enabled: $('read-replies').checked, volume: Number($('speech-volume').value) }))); } catch (error) { notice(error.message); } };
  $('read-replies').addEventListener('change', saveSpeech); $('speech-volume').addEventListener('change', saveSpeech);
  function voiceControls(value, initial = false) {
    if (!value.voiceSettings) return;
    const selected = initial ? value.voiceSettings.profileId : $('voice-profile').value || value.voiceSettings.profileId;
    $('voice-profile').replaceChildren();
    for (const profile of value.profiles) { const option = document.createElement('option'); option.value = profile.id; option.textContent = profile.name + (profile.status === 'ready' ? '' : '（待制作）'); $('voice-profile').append(option); }
    $('voice-profile').value = selected;
    if (initial) { $('voice-backend').value = value.voiceSettings.backend; $('voice-stream').checked = value.voiceSettings.stream; $('voice-status').textContent = ''; }
    $('voice-availability').textContent = value.natural.available ? value.natural.ready ? 'CosyVoice3 已加载。' : 'CosyVoice3 可用，首次加载可能需要等待。' : 'CosyVoice3 语音包尚未准备，系统语音可以继续使用。';
    $('voice-backend').querySelector('[value=cosyvoice3]').disabled = !value.natural.available;
    for (const id of ['voice-save', 'voice-preview', 'voice-reload', 'voice-import', 'voice-prepare']) $(id).disabled = value.active || !!active;
    $('voice-reload').disabled ||= !value.natural.available; $('voice-import').disabled ||= !value.natural.available;
    $('voice-prepare').disabled ||= !value.natural.available || !$('voice-profile').value.startsWith('voice-');
    $('voice-stop').disabled = !value.active;
  }
  $('open-voice').addEventListener('click', () => { voiceControls(speech, true); $('voice-dialog').showModal(); });
  $('close-voice').addEventListener('click', () => $('voice-dialog').close());
  $('voice-profile').addEventListener('change', () => voiceControls(speech));
  const selectedVoice = () => ({ backend: $('voice-backend').value, profileId: $('voice-profile').value, stream: $('voice-stream').checked });
  const voiceAction = async callback => { try { $('voice-status').textContent = '正在处理…'; speechControls(await callback()); $('voice-status').textContent = speech.error?.message || (speech.fallback ? '已使用系统语音：' + speech.fallback : '已完成。'); } catch (error) { $('voice-status').textContent = error.message; } };
  $('voice-form').addEventListener('submit', event => { event.preventDefault(); void voiceAction(() => call(api.saveVoice(selectedVoice()))); });
  $('voice-preview').addEventListener('click', () => void voiceAction(async () => { await call(api.saveVoice(selectedVoice())); return call(api.previewVoice()); }));
  $('voice-reload').addEventListener('click', () => void voiceAction(() => call(api.reloadVoice())));
  $('voice-stop').addEventListener('click', () => void voiceAction(() => call(api.stopSpeech())));
  $('voice-import').addEventListener('click', () => void voiceAction(() => call(api.importVoice({ name: $('voice-name').value.trim(), text: $('voice-text').value.trim() }))));
  $('voice-prepare').addEventListener('click', () => void voiceAction(() => call(api.prepareVoice({ profileId: $('voice-profile').value }))));
  for (const [id, method] of [['avatar-toggle', 'toggleAvatar'], ['avatar-pause', 'pauseAvatar'], ['avatar-reload', 'reloadAvatar']]) {
    $(id).addEventListener('click', async () => { try { avatarControls(await call(api[method]())); } catch (error) { notice(error.message); } });
  }
  api.onAvatarUpdate(avatarControls);
  $('open-settings').addEventListener('click', openSettings); $('model-indicator').addEventListener('click', openSettings);
  $('close-settings').addEventListener('click', () => $('settings-dialog').close());
  $('message-input').addEventListener('input', controls);
  $('message-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!$('send').disabled) $('composer').requestSubmit(); } });
  $('composer').addEventListener('submit', async event => {
    event.preventDefault(); if (sending || active || !currentId) return;
    const id = currentId, text = $('message-input').value; if (!text.trim()) return;
    sending = true; controls(); notice();
    try {
      await call(api.send({ conversationId: id, text })); drafts.delete(id);
      if (currentId === id && $('message-input').value === text) $('message-input').value = '';
      await refresh();
    } catch (error) { notice(error.message); }
    finally { sending = false; controls(); }
  });
  $('stop').addEventListener('click', async () => { try { await call(api.cancel({ conversationId: currentId })); await refresh(); } catch (error) { notice(error.message); } });
  $('settings-form').addEventListener('submit', async event => {
    event.preventDefault(); $('save-settings').disabled = true;
    try {
      await call(api.saveSettings({ baseUrl: $('base-url').value.trim(), model: $('model-name').value.trim(), timeoutSeconds: Number($('timeout').value), contextTokens: Number($('context-tokens').value) }));
      $('settings-status').textContent = '设置已保存。'; await refresh();
    } catch (error) { $('settings-status').textContent = error.message; }
    finally { $('save-settings').disabled = false; }
  });
  $('load-models').addEventListener('click', async () => {
    $('load-models').disabled = true; $('settings-status').textContent = '正在读取已保存地址的模型列表…';
    try {
      const models = await call(api.models()), list = $('model-options'); list.replaceChildren();
      for (const model of models) { const option = document.createElement('option'); option.value = model; list.append(option); }
      if (models.length && !$('model-name').value) $('model-name').value = models[0];
      $('settings-status').textContent = models.length ? `已找到 ${models.length} 个模型，请选择并保存。` : '服务未返回模型，请先加载模型。';
    } catch (error) { $('settings-status').textContent = error.message; }
    finally { $('load-models').disabled = false; }
  });
  api.onUpdate(value => { if (value.error) notice(value.error.message); void refresh().catch(error => notice(error.message)); });
  (async () => { try { await refresh(); if (!currentId) await create(); else await call(api.speechFocus({ conversationId: currentId })); } catch (error) { notice(error.message); } })();
})();
