'use strict';
const fs = require('node:fs'), path = require('node:path'), { createHash, randomUUID } = require('node:crypto'), { createRequire } = require('node:module'), { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..'), desktopRequire = createRequire(path.join(ROOT, 'apps/desktop/package.json'));
const { auditRelease } = require('./audit-release.cjs');
const SOURCE_DOCS = ['release.md', 'source-readme.md', 'configuration.md', 'worker-protocol.md'];
function files(root, prefix = '') {
  return fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw Error('Links are not allowed in release input: ' + relative);
    return entry.isDirectory() ? files(root, relative) : [relative];
  });
}
function copy(source, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL); }
function copyTree(source, target, allow = () => true) { for (const file of files(source)) if (allow(file)) copy(path.join(source, file), path.join(target, file)); }
function hash(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function manifest(directory, kind, buildId) {
  const entries = files(directory).filter(file => file !== 'build-manifest.json').map(file => ({ path: file, bytes: fs.statSync(path.join(directory, file)).size, sha256: hash(path.join(directory, file)) }));
  const record = { schemaVersion: 1, kind, buildId, version: '2.0.0-preview.1', publication: 'local-review-candidate', createdAt: new Date().toISOString(), files: entries };
  fs.writeFileSync(path.join(directory, 'build-manifest.json'), JSON.stringify(record, null, 2)); return record;
}
function productionModules(target) {
  const installed = new Map();
  const visit = (name, requester) => {
    const req = createRequire(path.join(requester, 'package.json')); let directory = path.dirname(req.resolve(name));
    while (!fs.existsSync(path.join(directory, 'package.json')) || JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).name !== name) { const parent = path.dirname(directory); if (parent === directory) throw Error('Package not found: ' + name); directory = parent; }
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
    if (installed.has(name)) { if (installed.get(name) !== pkg.version) throw Error('Dependency version collision: ' + name); return; }
    installed.set(name, pkg.version); copyTree(directory, path.join(target, 'node_modules', name), file => !file.split('/').includes('node_modules'));
    for (const child of Object.keys(pkg.dependencies || {})) visit(child, directory);
  };
  const desktop = path.join(ROOT, 'apps/desktop'), pkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json')));
  for (const name of Object.keys(pkg.dependencies)) visit(name, desktop);
  return Object.fromEntries(installed);
}
function appFiles(target, includeCore) {
  for (const file of ['main.cjs', 'preload.cjs', 'avatar-preload.cjs']) copy(path.join(ROOT, 'apps/desktop', file), path.join(target, 'apps/desktop', file));
  for (const dir of ['lib', 'ui']) copyTree(path.join(ROOT, 'apps/desktop', dir), path.join(target, 'apps/desktop', dir));
  copy(path.join(ROOT, 'apps/desktop/tools/system-speech.ps1'), path.join(target, 'apps/desktop/tools/system-speech.ps1'));
  for (const dir of ['packages/contracts', 'packages/sqlite-vendor', 'packages/avatar', 'workers']) copyTree(path.join(ROOT, dir), path.join(target, dir), file => !file.split('/').includes('__pycache__') && !file.endsWith('.pyc') && (includeCore || !file.endsWith('live2dcubismcore.min.js')));
  copy(path.join(ROOT, 'configs/v2.example.json'), path.join(target, 'configs/v2.example.json')); copy(path.join(ROOT, 'LICENSE'), path.join(target, 'LICENSE'));
}
function zip(source, target) {
  execFileSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'compress-release.ps1'), '-Source', source, '-Output', target], { windowsHide: true, stdio: 'pipe' });
  fs.writeFileSync(target + '.sha256', hash(target) + '  ' + path.basename(target) + '\n');
}
function sourceReadme(target) {
  const text = fs.readFileSync(path.join(ROOT, 'docs/source-readme.md'), 'utf8').replace(/\]\(configuration\.md\)/gu, '](docs/configuration.md)');
  fs.writeFileSync(target, text);
}
function build() {
  const buildId = 'm5-' + new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).replaceAll('-', '') + '-' + randomUUID().slice(0, 8);
  const output = path.join(ROOT, 'dist/releases', buildId), bundle = path.join(output, 'windows'), appRoot = path.join(bundle, 'resources/app'), source = path.join(output, 'source');
  fs.mkdirSync(output, { recursive: true });
  const electronRoot = path.dirname(desktopRequire.resolve('electron/package.json')), electron = JSON.parse(fs.readFileSync(path.join(electronRoot, 'package.json')));
  if (electron.version !== '45.2.1') throw Error('Electron lock mismatch');
  copyTree(path.join(electronRoot, 'dist'), bundle, file => file !== 'electron.exe' && file !== 'resources/default_app.asar' && (!file.startsWith('locales/') || ['locales/en-US.pak', 'locales/zh-CN.pak'].includes(file)));
  copy(path.join(electronRoot, 'dist/electron.exe'), path.join(bundle, 'Live2D-LLM-Chat.exe'));
  appFiles(appRoot, true); const dependencies = productionModules(appRoot);
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'live2d-llm-chat', version: '2.0.0-preview.1', main: 'apps/desktop/main.cjs' }, null, 2));
  copy(path.join(ROOT, 'tools/Install-Live2D.ps1'), path.join(bundle, 'Install-Live2D.ps1'));
  copy(path.join(ROOT, 'docs/release.md'), path.join(bundle, 'README.md'));
  const runtimeAudit = auditRelease(bundle), runtimeManifest = manifest(bundle, 'windows-preview', buildId);
  appFiles(source, false);
  for (const file of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'pyproject.toml', '.gitignore', '.gitattributes']) copy(path.join(ROOT, file), path.join(source, file));
  sourceReadme(path.join(source, 'README.md'));
  copy(path.join(ROOT, 'apps/desktop/package.json'), path.join(source, 'apps/desktop/package.json'));
  copyTree(path.join(ROOT, 'apps/desktop/test'), path.join(source, 'apps/desktop/test'));
  copyTree(path.join(ROOT, 'apps/desktop/tools'), path.join(source, 'apps/desktop/tools'), file => file !== 'system-speech.ps1');
  for (const dir of ['tools', 'tests', 'requirements']) copyTree(path.join(ROOT, dir), path.join(source, dir), file => !file.includes('__pycache__') && !file.endsWith('.pyc'));
  for (const file of SOURCE_DOCS) copy(path.join(ROOT, 'docs', file), path.join(source, 'docs', file));
  const sourceAudit = auditRelease(source, true); manifest(source, 'source-preview', buildId);
  const archives = { windows: path.join(output, 'Live2D-LLM-Chat-win-x64-preview.zip'), source: path.join(output, 'Live2D-LLM-Chat-v2-source.zip') };
  zip(bundle, archives.windows); zip(source, archives.source);
  if (fs.statSync(archives.source).size > 30 * 1024 * 1024) throw Error('Source budget exceeded');
  const report = { buildId, output, bundle, archives, dependencies, audits: { runtimeAudit, sourceAudit }, runtimeBytes: runtimeManifest.files.reduce((sum, file) => sum + file.bytes, 0), sourceZipBytes: fs.statSync(archives.source).size, windowsZipBytes: fs.statSync(archives.windows).size, privateInputsIncluded: false, characterIncluded: false, sourceIncludesCore: false, publicReleaseApproved: false };
  fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2)); fs.writeFileSync(path.join(ROOT, 'dist/releases/latest.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); return report;
}
function refresh() {
  const pointer = path.join(ROOT, 'dist/releases/latest.json'), report = JSON.parse(fs.readFileSync(pointer)), tag = randomUUID().slice(0, 8), source = path.join(report.output, 'source-' + tag), appRoot = path.join(report.bundle, 'resources/app');
  // A lightweight documentation/tools refresh must never disguise a changed application.
  appFiles(source, false);
  for (const file of files(appRoot)) if (file !== 'package.json' && !file.startsWith('node_modules/') && !file.endsWith('live2dcubismcore.min.js')) {
    if (!fs.existsSync(path.join(source, file)) || hash(path.join(source, file)) !== hash(path.join(appRoot, file))) throw Error('Application changed; use a full build: ' + file);
  }
  for (const file of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'pyproject.toml', '.gitignore', '.gitattributes']) copy(path.join(ROOT, file), path.join(source, file));
  sourceReadme(path.join(source, 'README.md')); copy(path.join(ROOT, 'apps/desktop/package.json'), path.join(source, 'apps/desktop/package.json'));
  copyTree(path.join(ROOT, 'apps/desktop/test'), path.join(source, 'apps/desktop/test')); copyTree(path.join(ROOT, 'apps/desktop/tools'), path.join(source, 'apps/desktop/tools'), file => file !== 'system-speech.ps1');
  for (const dir of ['tools', 'tests', 'requirements']) copyTree(path.join(ROOT, dir), path.join(source, dir), file => !file.includes('__pycache__') && !file.endsWith('.pyc'));
  for (const file of SOURCE_DOCS) copy(path.join(ROOT, 'docs', file), path.join(source, 'docs', file));
  report.audits.sourceAudit = auditRelease(source, true); manifest(source, 'source-preview', report.buildId);
  report.archives.source = path.join(report.output, 'Live2D-LLM-Chat-v2-source-' + tag + '.zip'); zip(source, report.archives.source); report.sourceZipBytes = fs.statSync(report.archives.source).size;
  if (report.sourceZipBytes > 30 * 1024 * 1024) throw Error('Source budget exceeded');
  let changed = false;
  for (const [input, output] of [['tools/Install-Live2D.ps1', 'Install-Live2D.ps1'], ['docs/release.md', 'README.md']]) if (hash(path.join(ROOT, input)) !== hash(path.join(report.bundle, output))) { fs.copyFileSync(path.join(ROOT, input), path.join(report.bundle, output)); changed = true; }
  if (changed) { report.audits.runtimeAudit = auditRelease(report.bundle); const record = manifest(report.bundle, 'windows-preview', report.buildId); report.runtimeBytes = record.files.reduce((sum, file) => sum + file.bytes, 0); report.archives.windows = path.join(report.output, 'Live2D-LLM-Chat-win-x64-preview-' + tag + '.zip'); zip(report.bundle, report.archives.windows); report.windowsZipBytes = fs.statSync(report.archives.windows).size; }
  report.sourceCorrespondenceVerified = true; report.refreshedAt = new Date().toISOString(); fs.writeFileSync(pointer, JSON.stringify(report, null, 2)); fs.writeFileSync(path.join(report.output, 'build-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
if (require.main === module) process.argv.includes('--refresh') ? refresh() : build();
module.exports = { build, refresh, files, manifest, productionModules };
