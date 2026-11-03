'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const { AvatarAssets, containedFile } = require('../lib/avatar-assets.cjs');
const { AvatarController } = require('../lib/avatar.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const AVATAR = path.join(ROOT, 'packages/avatar');

function fixture(t, textures = ['a.png']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-avatar-'));
  t.after(() => { const resolved = path.resolve(root); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('live2d-avatar-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  fs.writeFileSync(path.join(root, 'model.model3.json'), JSON.stringify({ Version: 3, FileReferences: { Moc: 'model.moc3', Textures: textures }, Controllers: { Arbitrary: 'not forwarded' } }));
  for (const file of ['model.moc3', ...textures]) fs.writeFileSync(path.join(root, file), 'fixture');
  const config = { source: path.join(root, 'config.json'), config: { resources: { legacyRoot: '.', avatarModel: 'model.model3.json' } } };
  return { root, config };
}
test('vendored Cubism sources match all pinned Git blobs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(AVATAR, 'vendor-manifest.json')));
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(path.join(AVATAR, 'vendor', entry.path));
    assert.equal(bytes.length, entry.bytes, entry.path);
    const actual = crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    assert.equal(actual, entry.gitBlob, entry.path);
  }
});
test('asset catalog sanitizes metadata and supports different texture counts', async t => {
  const { config } = fixture(t, ['a.png', 'b.png', 'c.png']); const assets = new AvatarAssets(config);
  assert.equal(assets.error, null);
  const response = assets.response({ url: 'l2d://app/model/entry.json', method: 'GET' });
  const settings = await response.json();
  assert.equal(settings.FileReferences.Textures.length, 3); assert.equal(settings.Controllers, undefined);
  assert.equal(assets.response({ url: 'l2d://app/model/texture-1', method: 'GET' }).headers.get('Content-Type'), 'image/png');
});
test('asset catalog rejects unknown routes and foreign origins', t => {
  const { config } = fixture(t); const assets = new AvatarAssets(config);
  for (const url of ['l2d://other/model/moc', 'l2d://app/config.py', 'l2d://app/%2e%2e/config.py', 'file:///etc/passwd', 'l2d://app/model/moc?secret=1', 'l2d://user@app/model/moc']) {
    assert.equal(assets.response({ url, method: 'GET' }).status, 404, url);
  }
  assert.equal(assets.response({ url: 'l2d://app/model/moc', method: 'POST' }).status, 404);
});
test('asset paths cannot escape their root and missing models remain recoverable', t => {
  const { root, config } = fixture(t);
  for (const value of ['../secret', 'C:/secret', '/secret', 'a\\b', 'a:stream', '\0']) assert.throws(() => containedFile(root, value));
  fs.writeFileSync(path.join(root, 'model.model3.json'), JSON.stringify({ Version: 3, FileReferences: { Moc: '../outside', Textures: ['a.png'] } }));
  const assets = new AvatarAssets(config); assert.equal(assets.error, 'AVATAR_RESOURCE');
  assert.equal(assets.response({ url: 'l2d://app/avatar.html', method: 'GET' }).status, 200);
  assert.equal(assets.response({ url: 'l2d://app/model/entry.json', method: 'GET' }).status, 404);
});
test('parameter adapter maps asymmetric ranges and skips unsupported IDs', async () => {
  const { adaptParameters } = await import(pathToFileURL(path.join(AVATAR, 'driver.mjs')));
  const entries = new Map([['ParamAngleX', { min: -10, max: 30, default: 5 }], ['ParamMouthOpenY', { min: 0, max: 2, default: 0 }]]);
  assert.deepEqual(adaptParameters({ ParamAngleX: -1, ParamMouthOpenY: 0, ParamEarL: 1 }, entries), { ParamAngleX: -10, ParamMouthOpenY: 0 });
  assert.equal(adaptParameters({ ParamAngleX: Infinity }, entries).ParamAngleX, 5);
});
test('driver blinks, breathes, clamps gaze and never invents speech', async () => {
  const { AvatarDriver } = await import(pathToFileURL(path.join(AVATAR, 'driver.mjs')));
  const driver = new AvatarDriver(() => 0); driver.setMouse(50, -50);
  let closed = false, breathed = false;
  for (let index = 0; index < 240; index++) {
    const values = driver.update(1 / 60); closed ||= values.ParamEyeLOpen < 0.1; breathed ||= values.ParamBreath > 0.5;
    assert.equal(values.ParamMouthOpenY, 0); assert.ok(values.ParamEyeBallX <= 1 && values.ParamEyeBallY >= -1);
    assert.ok(Object.values(values).every(Number.isFinite));
  }
  assert.ok(closed && breathed);
  driver.setState('thinking'); const before = driver.update(1 / 60).ParamAngleZ;
  for (let index = 0; index < 60; index++) driver.update(1 / 60);
  assert.notEqual(driver.values.ParamAngleZ, before);
  driver.setPaused(true); const snapshot = structuredClone(driver.values), time = driver.time;
  for (let index = 0; index < 30; index++) driver.update(1 / 60);
  assert.deepEqual(driver.values, snapshot); assert.equal(driver.time, time);
  driver.setPaused(false); driver.update(1 / 60); assert.ok(driver.time > time);
});

test('native avatar window creation failure does not abort the chat host', async t => {
  const { config } = fixture(t), chat = new EventEmitter(); let unhandled = false;
  const controller = new AvatarController({ config, chat, chatWindow: {}, ipcMain: { removeHandler() {} },
    BrowserWindow: class { constructor() { throw Error('native window failed'); } },
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    session: { fromPartition: () => ({ protocol: { handle() {}, unhandle() { unhandled = true; } }, setPermissionRequestHandler() {} }) },
  });
  await controller.start();
  assert.equal(controller.state().phase, 'error'); assert.equal(controller.state().error, 'AVATAR_RENDER');
  assert.ok(unhandled); assert.equal(controller.window, null);
  chat.emit('update', { active: { conversationId: 'fixture' }, error: null }); assert.equal(controller.activity, 'thinking');
  controller.dispose(); assert.equal(chat.listenerCount('update'), 0);
});
