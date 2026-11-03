'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { strictJson } = require('./config.cjs');
const { fault } = require('./errors.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const ORIGIN = 'l2d://app';

function containedFile(root, relative) {
  if (typeof relative !== 'string' || !relative || /[\\:\x00-\x1f]/u.test(relative)
      || relative.split('/').includes('..') || path.isAbsolute(relative)) throw fault('AVATAR_RESOURCE');
  const realRoot = fs.realpathSync(root), file = fs.realpathSync(path.resolve(realRoot, relative));
  const distance = path.relative(realRoot, file);
  if (!distance || distance.startsWith('..' + path.sep) || path.isAbsolute(distance)
      || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw fault('AVATAR_RESOURCE');
  return file;
}
class AvatarAssets {
  constructor(config) {
    this.files = new Map(); this.error = null;
    const avatarRoot = path.join(ROOT, 'packages/avatar');
    for (const file of ['avatar.html', 'avatar.css', 'view.mjs', 'renderer.mjs', 'driver.mjs']) {
      this.files.set('/' + file, { file: containedFile(avatarRoot, file) });
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(avatarRoot, 'vendor-manifest.json'), 'utf8'));
    for (const entry of manifest.files) this.files.set('/vendor/' + entry.path, { file: containedFile(path.join(avatarRoot, 'vendor'), entry.path) });
    try {
      const resourceRoot = path.resolve(path.dirname(config.source), config.config.resources.avatarRoot || config.config.resources.legacyRoot);
      const entry = containedFile(resourceRoot, config.config.resources.avatarModel);
      const model = strictJson(fs.readFileSync(entry, 'utf8')), refs = model?.FileReferences;
      if (model.Version !== 3 || !refs || !Array.isArray(refs.Textures) || refs.Textures.length < 1 || refs.Textures.length > 64) throw fault('AVATAR_RESOURCE');
      const result = { Version: 3, FileReferences: { Moc: '/model/moc', Textures: [] } };
      const root = path.dirname(entry);
      this.files.set('/model/moc', { file: containedFile(root, refs.Moc), type: 'application/octet-stream' });
      for (const [index, texture] of refs.Textures.entries()) {
        const name = '/model/texture-' + index;
        const file = containedFile(root, texture);
        if (fs.statSync(file).size > 32 * 1024 * 1024 || path.extname(file).toLowerCase() !== '.png') throw fault('AVATAR_RESOURCE');
        this.files.set(name, { file, type: 'image/png' }); result.FileReferences.Textures.push(name);
      }
      if (refs.Physics) { this.files.set('/model/physics', { file: containedFile(root, refs.Physics), type: 'application/json' }); result.FileReferences.Physics = '/model/physics'; }
      this.files.set('/model/entry.json', { bytes: Buffer.from(JSON.stringify(result)), type: 'application/json' });
    } catch { this.error = 'AVATAR_RESOURCE'; }
  }
  resolve(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'l2d:' || parsed.hostname !== 'app' || parsed.port || parsed.username || parsed.password
          || parsed.search || parsed.hash || /%2f|%5c|%2e/iu.test(parsed.pathname)) return null;
      return this.files.get(parsed.pathname) || null;
    } catch { return null; }
  }
  response(request) {
    const item = request.method === 'GET' ? this.resolve(request.url) : null;
    if (!item) return new Response('Not found', { status: 404 });
    const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.frag': 'text/plain', '.vert': 'text/plain' };
    try {
      return new Response(item.bytes || fs.readFileSync(item.file), { headers: {
        'Content-Type': item.type || types[path.extname(item.file)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
      } });
    } catch { return new Response('Not found', { status: 404 }); }
  }
}
module.exports = { AvatarAssets, containedFile, ORIGIN };
