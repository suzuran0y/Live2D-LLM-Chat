'use strict';
const fs = require('node:fs'), path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { auditRelease } = require('./audit-release.cjs');
const ROOT = path.resolve(__dirname, '..');
function files(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '__pycache__', '.runtime', 'out'].includes(entry.name)) return [];
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw Error('Links are not allowed in upload input: ' + name);
    return entry.isDirectory() ? files(directory, name) : [name];
  });
}
function prepare() {
  const output = path.join(ROOT, 'dist/github-updates', randomUUID()), content = path.join(output, 'repository');
  fs.mkdirSync(content, { recursive: true });
  const selected = new Set(['.gitattributes', '.gitignore', 'LICENSE', 'README.md', 'README_CN.md', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'pyproject.toml', 'configs/v2.example.json']);
  for (const directory of ['apps/desktop', 'packages', 'workers', 'tools', 'tests', 'requirements', 'docs']) {
    for (const file of files(path.join(ROOT, directory))) {
      if (file.split('/').some(part => ['node_modules', '__pycache__', '.runtime', 'out'].includes(part)) || /\.(pyc|pyo)$/iu.test(file)
          || file.endsWith('live2dcubismcore.min.js') || file === 'asr-overlay-win-py312.lock.txt') continue;
      selected.add(directory + '/' + file);
    }
  }
  const model = 'Live2d_env/pachirisu anime girl - top half';
  for (const file of ['Live2d_env/running_photo.jpg', model + '.model3.json', model + '.moc3', model + '.physics3.json', model + '.4096/texture_00.png']) selected.add(file);
  const manifest = [];
  for (const file of [...selected].sort()) {
    const source = path.join(ROOT, file), target = path.join(content, file);
    if (fs.lstatSync(source).isSymbolicLink() || fs.statSync(source).size > 50 * 1024 * 1024) throw Error('Invalid upload input: ' + file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    manifest.push({ path: file, bytes: fs.statSync(target).size, sha256: createHash('sha256').update(fs.readFileSync(target)).digest('hex') });
  }
  const audit = auditRelease(content, true);
  for (const entry of manifest) if (/\.(py|cjs|mjs|js|json|txt|md|ps1)$/iu.test(entry.path)) {
    const text = fs.readFileSync(path.join(content, entry.path), 'utf8');
    if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/u.test(text)) throw Error('Possible credential in upload input: ' + entry.path);
  }
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
  const report = { output: content, audit, files: manifest, excludedTrackedPaths: tracked.filter(file => !selected.has(file)), gitIndexChanged: false, pushed: false };
  fs.writeFileSync(path.join(output, 'upload-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ROOT, 'dist/github-updates/latest.json'), JSON.stringify({ output: content, report: path.join(output, 'upload-report.json') }, null, 2));
  console.log(JSON.stringify({ output: content, files: manifest.length, bytes: manifest.reduce((n, file) => n + file.bytes, 0), excludedTrackedPaths: report.excludedTrackedPaths.length, audit: audit.passed }));
  return report;
}
if (require.main === module) prepare();
module.exports = { prepare };
