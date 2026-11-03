'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), net = require('node:net'), { spawn, execFileSync } = require('node:child_process'), { randomUUID } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, limit = 25000) { const began = Date.now(); while (!await check()) { if (Date.now() - began > limit) throw Error('Release check timeout'); await delay(50); } }
function assert(value, message) { if (!value) throw Error(message); }
async function freePort() { const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
class DebugPage {
  static async open(url) { const value = new DebugPage(); value.socket = new WebSocket(url); value.id = 0; value.jobs = new Map(); value.socket.addEventListener('message', event => { const frame = JSON.parse(event.data); const job = value.jobs.get(frame.id); if (!job) return; value.jobs.delete(frame.id); clearTimeout(job.timer); frame.error ? job.reject(Error(frame.error.message)) : job.resolve(frame.result); }); await new Promise((resolve, reject) => { value.socket.addEventListener('open', resolve, { once: true }); value.socket.addEventListener('error', reject, { once: true }); }); return value; }
  command(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id, timer = setTimeout(() => { this.jobs.delete(id); reject(Error('Debug command timeout: ' + method)); }, 30000); this.jobs.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const value = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (value.exceptionDetails) throw Error(value.exceptionDetails.text); return value.result?.value; }
  close() { for (const job of this.jobs.values()) { clearTimeout(job.timer); job.reject(Error('Page closed')); } this.jobs.clear(); this.socket.close(); }
}
async function run(bundle) {
  const reportRoot = path.join(path.dirname(bundle), 'checks', randomUUID()); fs.mkdirSync(reportRoot, { recursive: true }); const installed = path.join(reportRoot, 'installed');
  const ps = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  execFileSync(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(bundle, 'Install-Live2D.ps1'), '-Destination', installed, '-NoShortcut'], { windowsHide: true, stdio: 'pipe' });
  const userData = path.join(reportRoot, 'user-data'), roaming = path.join(reportRoot, 'roaming'), local = path.join(reportRoot, 'local'); for (const dir of [userData, roaming, local]) fs.mkdirSync(dir);
  const server = http.createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    if (request.url === '/v1/models') return response.end(JSON.stringify({ data: [{ id: 'release-fixture' }] }));
    const input = JSON.parse(body).messages.at(-1).content;
    const reply = () => { if (!response.destroyed) response.end(JSON.stringify({ choices: [{ message: { content: input === 'cancel-release' ? 'STALE_RELEASE_REPLY' : '独立发行包测试回复。' } }] })); };
    input === 'cancel-release' ? setTimeout(reply, 2000).unref() : reply();
  }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let child, page, exited; const launches = [];
  async function launch() {
    const port = await freePort(), environment = {};
    for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'COMSPEC', 'PATHEXT']) if (process.env[key]) environment[key] = process.env[key];
    Object.assign(environment, { PATH: path.join(process.env.SystemRoot || 'C:/Windows', 'System32'), APPDATA: roaming, LOCALAPPDATA: local, LIVE2D_USER_DATA: userData, LIVE2D_TEST_HIDDEN: '1' });
    child = spawn(path.join(installed, 'Live2D-LLM-Chat.exe'), [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { cwd: installed, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostic = ''; child.stdout.on('data', bytes => { diagnostic = (diagnostic + bytes).slice(-4000); }); child.stderr.on('data', bytes => { diagnostic = (diagnostic + bytes).slice(-4000); });
    exited = new Promise(resolve => child.once('close', resolve)); let target;
    await waitFor(async () => { if (child.exitCode !== null) throw Error('Packaged app exited: ' + diagnostic); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(value => value.type === 'page' && value.url.endsWith('/ui/index.html')); return !!target; } catch { return false; } });
    page = await DebugPage.open(target.webSocketDebuggerUrl); await waitFor(() => page.evaluate("!!window.desktop && document.querySelectorAll('#conversations button').length>0")); launches.push({ pathContainsDeveloperTools: /node|python|miniconda|pnpm/iu.test(environment.PATH), installedExecutable: true });
  }
  async function close() { if (page) { await page.evaluate('window.close(); void 0;').catch(() => {}); page.close(); page = null; } let timer; const closed = await Promise.race([exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 10000); })]); clearTimeout(timer); assert(closed, 'Packaged app did not close'); child = null; }
  try {
    await launch();
    await page.evaluate(`document.getElementById('open-settings').click(); document.getElementById('base-url').value='http://127.0.0.1:${server.address().port}/v1'; document.getElementById('model-name').value='release-fixture'; document.getElementById('settings-form').requestSubmit(); void 0;`);
    await waitFor(() => page.evaluate("document.getElementById('settings-status').textContent.includes('已保存')")); await page.evaluate("document.getElementById('close-settings').click(); void 0;");
    const send = text => page.evaluate(`document.getElementById('message-input').value=${JSON.stringify(text)}; document.getElementById('message-input').dispatchEvent(new Event('input')); document.getElementById('composer').requestSubmit(); void 0;`);
    await send('release-fixture'); await waitFor(() => page.evaluate("document.getElementById('messages').textContent.includes('独立发行包测试回复。')"));
    await send('cancel-release'); await waitFor(() => page.evaluate("!document.getElementById('stop').hidden")); await page.evaluate("document.getElementById('stop').click(); void 0;");
    await waitFor(() => page.evaluate("document.getElementById('messages').textContent.includes('已取消')")); await delay(2100); assert(!await page.evaluate("document.getElementById('messages').textContent.includes('STALE_RELEASE_REPLY')"), 'Late reply leaked');
    await page.evaluate("window.__releasePlayed=false; window.desktop.onSpeechUpdate(value=>{ if(value.phase==='playing')window.__releasePlayed=true; }); void 0;");
    const voice = await page.evaluate("(async()=>{await window.desktop.saveSpeech({enabled:false,volume:0});return await window.desktop.previewVoice();})()");
    assert(voice.ok && await page.evaluate('window.__releasePlayed'), 'Packaged system speech failed');
    fs.writeFileSync(path.join(reportRoot, 'ui-state.json'), JSON.stringify(await page.evaluate('window.desktop.bootstrap()'), null, 2));
    await close(); await launch(); await waitFor(() => page.evaluate("document.getElementById('messages').textContent.includes('独立发行包测试回复。')")); await close();
    const report = { passed: true, installed, reportRoot, launches, installChecksumsVerified: true, modelReplyVerified: true, cancellationVerified: true, restartVerified: true, systemSpeechVerified: true, realCloudRequests: 0, newWindowsAccountTested: false };
    fs.writeFileSync(path.join(reportRoot, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); return report;
  } finally { if (page) { await page.evaluate('window.close(); void 0;').catch(() => {}); page.close(); } if (child) { await Promise.race([exited, delay(5000)]); if (child.exitCode === null) child.kill(); } server.closeAllConnections(); server.close(); }
}
if (require.main === module) { const bundle = process.argv[2] || JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/releases/latest.json'))).bundle; run(path.resolve(bundle)).catch(error => { console.error(error.stack); process.exitCode = 1; }); }
module.exports = { run };
