import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import console from 'node:console';
import PocketBase, { ClientResponseError } from 'pocketbase';
import { createServer } from 'vite';

const endpoint = process.env.POKUS_TEST_PB_URL ?? 'http://127.0.0.1:8099';
if (!['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Integration tests require an isolated local PocketBase instance.');
const admin = new PocketBase(endpoint);
await admin.collection('_superusers').authWithPassword('pokus-test@example.com', 'Pokus-local-test-2026!');
await admin.collections.import(JSON.parse(await readFile('pb_schema.json', 'utf8')), false);
await admin.settings.update({ batch: { enabled: true, maxRequests: 3, timeout: 3, maxBodySize: 65536 } });
const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { '@': resolve('src') } }, define: { 'import.meta.env.VITE_POCKETBASE_URL': JSON.stringify(endpoint) }, server: { middlewareMode: true } });
try {
  const { pb } = await vite.ssrLoadModule('/src/lib/pocketbase.ts');
  const { sendSessionOperation } = await vite.ssrLoadModule('/src/lib/session-sync.ts');
  const user = await admin.collection('users').create({ email: `pokus-${Date.now()}@example.com`, password: 'Pokus-test-user-2026!', passwordConfirm: 'Pokus-test-user-2026!' });
  await pb.collection('users').authWithPassword(user.email, 'Pokus-test-user-2026!');
  const owner = user.id;
  const makeTask = () => pb.collection('tasks').create({ owner, title: 'Integration focus task', focusedSeconds: 100, priority: 'none' });
  const session = (id, taskId, mode = 'complete') => ({ id, taskId, mode, durationMinutes: 25, remainingSeconds: mode === 'complete' ? 0 : 1500, isActive: mode === 'running', lastTick: Date.now() });
  const op = (value) => ({ revision: 1, session: value });
  const task = await makeTask();
  const id = 'test' + Math.random().toString(36).slice(2).padEnd(11,'0').slice(0,11);
  const completed = session(id, task.id);
  await sendSessionOperation(owner, op(completed));
  assert.equal((await pb.collection('tasks').getOne(task.id)).focusedSeconds, 1600);
  await sendSessionOperation(owner, op(completed));
  assert.equal((await pb.collection('tasks').getOne(task.id)).focusedSeconds, 1600);
  assert.equal((await pb.collection('pomodoro_completion_receipts').getOne(id)).creditedSeconds, 1500);
  await assert.rejects(pb.collection('pomodoro_sessions').update(id, { mode: 'running', isActive: true }));
  await assert.rejects(pb.collection('pomodoro_sessions').delete(id));
  await assert.rejects(pb.collection('pomodoro_completion_receipts').update(id, { creditedSeconds: 0 }));

  const concurrentTask = await makeTask();
  const concurrent = session('race' + id.slice(4), concurrentTask.id);
  await Promise.all([sendSessionOperation(owner, op(concurrent)), sendSessionOperation(owner, op(concurrent))]);
  assert.equal((await pb.collection('tasks').getOne(concurrentTask.id)).focusedSeconds, 1600);

  const lostTask = await makeTask();
  const lost = session('lost' + id.slice(4), lostTask.id);
  const originalBatch = pb.createBatch.bind(pb);
  let responseLost = false;
  pb.createBatch = () => {
    const batch = originalBatch(); const send = batch.send.bind(batch);
    batch.send = async (...args) => { const response = await send(...args); if (!responseLost) { responseLost = true; throw new ClientResponseError({ status: 0 }); } return response; };
    return batch;
  };
  await sendSessionOperation(owner, op(lost));
  pb.createBatch = originalBatch;
  assert.equal((await pb.collection('tasks').getOne(lostTask.id)).focusedSeconds, 1600);

  const deletedTask = await makeTask();
  await pb.collection('tasks').delete(deletedTask.id);
  const deleted = session('gone' + id.slice(4), deletedTask.id);
  await sendSessionOperation(owner, op(deleted));
  assert.equal((await pb.collection('pomodoro_sessions').getOne(deleted.id)).task, '');
  assert.equal((await pb.collection('pomodoro_completion_receipts').getOne(deleted.id)).creditedSeconds, 0);

  const rollbackId = 'roll' + id.slice(4);
  const batch = pb.createBatch();
  batch.collection('pomodoro_sessions').create({ ...session(rollbackId, null), owner });
  batch.collection('tasks').update('missing00000000', { 'focusedSeconds+': 25 });
  await assert.rejects(batch.send());
  await assert.rejects(pb.collection('pomodoro_sessions').getOne(rollbackId));

  const discarded = session('stop' + id.slice(4), null, 'discarded');
  await sendSessionOperation(owner, op(discarded));
  const result = await sendSessionOperation(owner, op({ ...discarded, mode: 'running', isActive: true }));
  assert.equal(result.mode, 'discarded');
  console.log('PASS: atomic credit, duplicate retry, concurrent clients, lost response, deleted task, rollback, immutable terminal sessions and receipts.');

  // Projects contain captures through a many-to-many `captures` relation.
  const capture = (note) => pb.collection('captures').create({ owner, kind: 'note', note });
  const [first, second] = await Promise.all([capture('First'), capture('Second')]);
  const project = await pb.collection('projects').create({ owner, title: 'Capture links', isDone: false, status: 'active' });
  const otherProject = await pb.collection('projects').create({ owner, title: 'Other', isDone: false, status: 'active', captures: [first.id] });
  await Promise.all([
    pb.collection('projects').update(project.id, { 'captures+': [first.id] }),
    pb.collection('projects').update(project.id, { 'captures+': [second.id] }),
  ]);
  assert.deepEqual([...(await pb.collection('projects').getOne(project.id)).captures].sort(), [first.id, second.id].sort());
  await pb.collection('projects').update(project.id, { 'captures-': [second.id] });
  assert.deepEqual((await pb.collection('projects').getOne(project.id)).captures, [first.id]);
  await pb.collection('projects').update(project.id, { title: 'Renamed' });
  assert.deepEqual((await pb.collection('projects').getOne(project.id)).captures, [first.id]);

  const stranger = await admin.collection('users').create({ email: `pokus-other-${Date.now()}@example.com`, password: 'Pokus-test-user-2026!', passwordConfirm: 'Pokus-test-user-2026!' });
  const foreign = await admin.collection('captures').create({ owner: stranger.id, kind: 'note', note: 'Not yours' });
  await assert.rejects(pb.collection('projects').update(project.id, { 'captures+': [foreign.id] }));
  await assert.rejects(pb.collection('projects').create({ owner, title: 'Sneaky', isDone: false, captures: [foreign.id] }));

  await pb.collection('captures').delete(first.id);
  assert.deepEqual((await pb.collection('projects').getOne(project.id)).captures, []);
  assert.deepEqual((await pb.collection('projects').getOne(otherProject.id)).captures, []);
  await pb.collection('projects').delete(otherProject.id);
  assert.equal((await pb.collection('captures').getOne(second.id)).note, 'Second');
  console.log('PASS: project capture links add and remove atomically, reject foreign captures, clear deleted captures, and keep captures when a project is deleted.');

  // Knowledge has one origin project, many referencing projects, and many source captures.
  const book = await pb.collection('captures').create({ owner, kind: 'book', title: 'Atomic Habits', author: 'James Clear' });
  const reading = await pb.collection('projects').create({ owner, title: 'Read Atomic Habits', isDone: false, status: 'active', captures: [book.id] });
  const fitness = await pb.collection('projects').create({ owner, title: 'Fitness', isDone: false, status: 'active' });
  const note = (title) => pb.collection('knowledge').create({ owner, title, status: 'draft', project: reading.id, sources: [book.id], locator: 'Ch. 1' });
  const [loop, rule] = await Promise.all([note('Habit loop'), note('Two-minute rule')]);
  await Promise.all([
    pb.collection('knowledge').update(loop.id, { 'linkedProjects+': [fitness.id] }),
    pb.collection('knowledge').update(loop.id, { title: 'The habit loop' }),
  ]);
  assert.deepEqual((await pb.collection('knowledge').getOne(loop.id)).linkedProjects, [fitness.id]);
  assert.equal((await pb.collection('knowledge').getList(1, 10, { filter: `sources ~ "${book.id}"` })).totalItems, 2);
  const foreignProject = await admin.collection('projects').create({ owner: stranger.id, title: 'Not yours', isDone: false });
  await assert.rejects(pb.collection('knowledge').update(rule.id, { 'linkedProjects+': [foreignProject.id] }));
  await assert.rejects(pb.collection('knowledge').update(rule.id, { project: foreignProject.id }));
  await assert.rejects(pb.collection('knowledge').update(rule.id, { 'sources+': [foreign.id] }));
  await assert.rejects(pb.collection('knowledge').create({ owner, title: 'Sneaky', status: 'draft', sources: [foreign.id] }));
  await assert.rejects(pb.collection('knowledge').create({ owner: stranger.id, title: 'Impostor', status: 'draft' }));
  await assert.rejects(pb.collection('knowledge').create({ owner, title: '', status: 'draft' }));
  await pb.collection('projects').delete(fitness.id);
  assert.deepEqual((await pb.collection('knowledge').getOne(loop.id)).linkedProjects, []);
  await pb.collection('projects').delete(reading.id);
  assert.equal((await pb.collection('knowledge').getOne(loop.id)).project, '');
  await pb.collection('captures').delete(book.id);
  assert.deepEqual((await pb.collection('knowledge').getOne(rule.id)).sources, []);
  assert.equal((await pb.collection('knowledge').getOne(rule.id)).title, 'Two-minute rule');
  console.log('PASS: knowledge links projects and sources, rejects foreign relations, and survives deleted projects and captures.');
} finally { await vite.close(); }
