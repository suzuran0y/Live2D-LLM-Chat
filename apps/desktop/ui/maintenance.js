(() => {
  'use strict';
  const api = window.desktop, $ = id => document.getElementById(id);
  let historyToken = null, resourceToken = null;
  async function call(promise) { const result = await promise; if (!result.ok) throw Error(result.error.message); return result.value; }
  async function historyPreview() {
    $('history-choose').disabled = true; $('history-confirm').disabled = true; historyToken = null; $('history-preview').replaceChildren(); $('history-status').textContent = '正在读取预览…';
    try {
      const value = await call(api.previewHistory()); if (!value) { $('history-status').textContent = '未选择文件。'; return; }
      historyToken = value.token; $('history-confirm').disabled = false;
      $('history-status').textContent = `${value.name} · ${value.count}条存档，预览前${value.preview.length}条` + (value.mode === 'raw-archive' ? ' · 格式无法明确分轮，将完整保留原始文本。' : '');
      for (const message of value.preview) { const row = document.createElement('p'); row.textContent = (message.role === 'user' ? '你：' : '旧版助手：') + message.content; $('history-preview').append(row); }
    } catch (error) { $('history-status').textContent = error.message; } finally { $('history-choose').disabled = false; }
  }
  $('open-history').addEventListener('click', () => { $('history-dialog').showModal(); void historyPreview(); });
  $('history-choose').addEventListener('click', historyPreview); $('history-close').addEventListener('click', () => $('history-dialog').close());
  $('history-confirm').addEventListener('click', async () => {
    $('history-confirm').disabled = true;
    try { const value = await call(api.importHistory({ token: historyToken })); $('history-status').textContent = value.duplicate ? '此文件已经导入，已打开原存档。' : '已导入，原文件保留。'; window.dispatchEvent(new CustomEvent('history-imported', { detail: value.conversationId })); }
    catch (error) { $('history-status').textContent = error.message; }
  });
  async function resourceAction(action) {
    const ids = ['resources-choose', 'resources-confirm', 'resources-cosy', 'resources-python', 'resources-close']; for (const id of ids) $(id).disabled = true;
    $('resources-status').textContent = '正在校验资源，较大的文件可能需要等待…';
    try { await action(); } catch (error) { $('resources-status').textContent = error.message; }
    finally { for (const id of ids) $(id).disabled = false; $('resources-confirm').disabled = !resourceToken; }
  }
  $('open-resources').addEventListener('click', () => { $('resources-dialog').showModal(); });
  $('resources-close').addEventListener('click', () => $('resources-dialog').close());
  $('resources-choose').addEventListener('click', () => void resourceAction(async () => {
    resourceToken = null; const value = await call(api.previewResources()); if (!value) { $('resources-status').textContent = '未选择资源包。'; return; }
    resourceToken = value.token; $('resources-status').textContent = `${value.label} · ${value.count}个文件 · ${(value.bytes / 1048576).toFixed(1)} MiB。确认后复制到本机资源目录。`;
  }));
  $('resources-confirm').addEventListener('click', () => void resourceAction(async () => { const value = await call(api.installResources({ token: resourceToken })); resourceToken = null; $('resources-status').textContent = value.kind === 'asr' ? '识别模型已安装，请选择已准备好依赖的识别解释器。' : '角色资源已安装并启用。'; }));
  for (const [id, kind] of [['resources-cosy', 'cosyvoice3'], ['resources-python', 'asr-python']]) $(id).addEventListener('click', () => void resourceAction(async () => { const value = await call(api.linkResources({ kind })); $('resources-status').textContent = value ? '已接入并保存。' : '未选择资源。'; }));
})();
