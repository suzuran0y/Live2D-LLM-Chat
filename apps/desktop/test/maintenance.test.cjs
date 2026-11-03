'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { createHash } = require('node:crypto');
const { parseHistory, HistoryImport } = require('../lib/history-import.cjs'), { ConversationStore } = require('../lib/store.cjs');
const { ConfigStore } = require('../lib/config.cjs'), { safeFile, verifyPack, ResourcePacks } = require('../lib/resource-pack.cjs');
function fixture(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-m5-')); t.after(() => { assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(root).startsWith('live2d-m5-')); fs.rmSync(root, { recursive: true, force: true }); }); return root; }
const raw = 'Time：2025-02-28 04:00:00\nUser：旧问题\nNeko：旧回复\n---\n';
test('legacy parser supports both old formats and preserves ambiguous text without guessing roles', () => {
  const parsed = parseHistory(Buffer.from(raw)); assert.equal(parsed.mode, 'structured'); assert.equal(parsed.messages.length, 2); assert.match(parsed.messages[0].content, /旧记录时间/u);
  assert.equal(parseHistory(Buffer.from('用户：你好\n猫娘：你好呀\n---\n')).messages[1].content, '你好呀');
  const ambiguous = 'User：你好\nNeko：段落\n---\n额外内容'; const archived = parseHistory(Buffer.from(ambiguous)); assert.equal(archived.mode, 'raw-archive'); assert.ok(archived.messages[0].content.includes(ambiguous));
  assert.throws(() => parseHistory(Buffer.from([0xff, 0x00])), { code: 'HISTORY_INVALID' });
});
test('import previews are bounded snapshots, deduplicate, back up and never enter model context', async t => {
  const root = fixture(t), file = path.join(root, 'history.txt'), database = path.join(root, 'conversations.sqlite'); fs.writeFileSync(file, raw);
  const store = await ConversationStore.open(database); t.after(() => store.close());
  const service = new HistoryImport({ store, chooseFile: async () => file }); const preview = await service.preview();
  assert.equal(store.list().length, 0); assert.equal(preview.count, 2);
  const result = service.commit(preview.token); assert.equal(result.duplicate, false); assert.deepEqual(store.completedContext(result.conversationId), []);
  assert.ok(store.get(result.conversationId).messages.every(message => message.status === 'imported')); assert.equal(fs.readFileSync(file, 'utf8'), raw);
  const duplicate = service.commit((await service.preview()).token); assert.equal(duplicate.duplicate, true); assert.equal(store.list().length, 1); assert.equal(fs.readdirSync(path.join(root, 'backups')).length, 1);
  await service.preview(); service.pending.expires = 0; assert.throws(() => service.commit(service.pending.token), { code: 'HISTORY_EXPIRED' });
});
test('failed archive writes roll back messages, import marker and schema state', async t => {
  const root = fixture(t), store = await ConversationStore.open(path.join(root, 'db.sqlite')); t.after(() => store.close());
  store.write = () => { throw Error('full disk'); };
  assert.throws(() => store.importArchive(parseHistory(Buffer.from(raw))), { code: 'STORAGE' }); assert.equal(store.list().length, 0); assert.equal(store.rows('SELECT * FROM history_imports').length, 0);
});
test('resource overrides persist independently and failed writes leave the current configuration intact', t => {
  const root = fixture(t), source = path.join(root, 'example.json'); fs.copyFileSync(path.resolve(__dirname, '../../../configs/v2.example.json'), source);
  const config = new ConfigStore({ source, dataRoot: root }); config.saveResources({ resources: { avatarRoot: root, avatarModel: 'entry.json' } });
  const reopened = new ConfigStore({ source, dataRoot: root }); assert.equal(reopened.config.resources.avatarRoot, root);
  reopened.write = () => { throw Error(); }; assert.throws(() => reopened.saveResources({ resources: { avatarRoot: 'changed' } }), { code: 'STORAGE' }); assert.equal(reopened.config.resources.avatarRoot, root);
});
async function packet(t) {
  const root = fixture(t); fs.writeFileSync(path.join(root, 'model.model3.json'), JSON.stringify({ Version: 3, FileReferences: { Moc: 'model.moc3', Textures: ['texture.png'] } }));
  fs.writeFileSync(path.join(root, 'model.moc3'), 'fixture-moc'); fs.writeFileSync(path.join(root, 'texture.png'), 'fixture-png');
  const files = ['model.model3.json', 'model.moc3', 'texture.png'].map(file => { const bytes = fs.readFileSync(path.join(root, file)); return { path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; });
  const value = { schemaVersion: 1, kind: 'avatar', id: 'fixture-avatar', label: 'Fixture', redistribution: 'review-required', entry: 'model.model3.json', files };
  fs.writeFileSync(path.join(root, 'resource.json'), JSON.stringify(value)); return { root, value };
}
test('resource package verification rejects changed bytes, traversal, reserved paths and case duplicates', async t => {
  const { root, value } = await packet(t); await verifyPack(root);
  for (const bad of ['../escape', 'C:/outside', 'a\\b', 'CON', 'file.', '/absolute']) assert.throws(() => safeFile(root, bad));
  fs.writeFileSync(path.join(root, 'model.moc3'), 'changed-moc'); await assert.rejects(verifyPack(root), { code: 'RESOURCE_INVALID' });
  value.files.push({ ...value.files[1], path: 'MODEL.MOC3' }); fs.writeFileSync(path.join(root, 'resource.json'), JSON.stringify(value)); await assert.rejects(verifyPack(root), { code: 'RESOURCE_INVALID' });
});
test('resource installation requires preview and enables only a completely verified copy', async t => {
  const { root } = await packet(t), dataRoot = fixture(t); let applied;
  const service = new ResourcePacks({ dataRoot, choosePack: async () => root, busy: () => false, apply: async value => { applied = value; } });
  await assert.rejects(service.install('invalid'), { code: 'RESOURCE_INVALID' }); const preview = await service.preview(); assert.equal(applied, undefined);
  assert.equal((await service.install(preview.token)).installed, true); assert.ok(applied.resources.avatarRoot.startsWith(dataRoot + path.sep)); await verifyPack(applied.resources.avatarRoot);
});
test('unapproved ASR model hashes cannot be activated as a model pack', async t => {
  const { root, value } = await packet(t); value.kind = 'asr'; value.entry = 'model'; fs.writeFileSync(path.join(root, 'resource.json'), JSON.stringify(value)); await assert.rejects(verifyPack(root), { code: 'RESOURCE_INVALID' });
});
test('release audits block private files, virtual environments and plaintext key patterns', t => {
  const { auditRelease } = require('../../../tools/audit-release.cjs');
  for (const file of ['.env', 'private.sqlite', 'venv/pyvenv.cfg']) { const root = fixture(t), full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, 'fixture'); assert.throws(() => auditRelease(root)); }
  const root = fixture(t); fs.writeFileSync(path.join(root, 'config.txt'), 'sk-' + 'a'.repeat(50)); assert.throws(() => auditRelease(root));
});
