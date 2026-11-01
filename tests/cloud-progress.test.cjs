const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const source = ['outputs/progress.js', 'outputs/cloud-progress.js'].map(path => fs.readFileSync(path, 'utf8'));
const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const data = totalXp => ({ version: 2, totalXp, attempts: [], skills: {}, streakDays: 0, lastActiveDate: null });

function harness(handler, protocol = 'file:') {
  const memory = new Map();
  const listeners = new Map();
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  const localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value))
  };
  const window = {
    location: { protocol }, AbortController,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    dispatchEvent(event) { (listeners.get(event.type) || []).forEach(fn => fn(event)); },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(path, options) { calls.push({ path, ...options }); return handler(path, options); }
  };
  const context = vm.createContext({ window, localStorage, Date, console });
  source.forEach(script => vm.runInContext(script, context));
  return { cloud: window.MathRushCloud, progress: window.MathRushProgress, calls, memory, timers, localStorage };
}

test('guest practice requires explicit import and account caches stay separate', async () => {
  let signedIn = 'alice';
  const remote = { alice: { progress: data(200), revision: 2 }, bob: { progress: null, revision: 0 } };
  const app = harness((path, options) => {
    assert.equal(path, '/api/progress');
    if (options.method === 'PUT') {
      const incoming = JSON.parse(options.body);
      assert.equal(incoming.revision, remote[signedIn].revision);
      remote[signedIn] = { progress: incoming.progress, revision: incoming.revision + 1 };
    }
    return reply(remote[signedIn]);
  });
  app.progress.recordAttempt('addition-ten', true, 100);
  await app.cloud.connect({ id: 'alice' });
  assert.equal(app.progress.load().totalXp, 200);
  assert.equal(app.calls.some(call => call.method === 'PUT'), false, 'Connecting never uploads guest data');
  app.progress.recordAttempt('tables', true, 100);
  await app.cloud.sync();
  signedIn = 'bob';
  await app.cloud.connect({ id: 'bob' });
  assert.equal(app.progress.load().totalXp, 0);
  assert.equal(app.cloud.status().userId, 'bob');
  await app.cloud.importGuest();
  assert.equal(remote.bob.progress.totalXp, 10);
  await app.cloud.importGuest();
  assert.equal(remote.bob.progress.totalXp, 10, 'Repeated import cannot double-count attempts');
  app.cloud.disconnect();
  assert.equal(app.progress.load().totalXp, 10, 'Disconnect restores the independent guest snapshot');
  signedIn = 'alice';
  await app.cloud.connect({ id: 'alice' });
  assert.equal(app.progress.load().totalXp, 210);
  await app.cloud.importGuest();
  assert.equal(app.progress.load().totalXp, 210, 'Import cannot replace an existing student account');
});

test('a late GET from a prior account cannot overwrite the current student', async () => {
  const old = deferred();
  let getCount = 0;
  const app = harness(() => ++getCount === 1 ? old.promise : reply({ progress: data(50), revision: 4 }));
  const alice = app.cloud.connect({ id: 'alice' });
  const sameAlice = app.cloud.connect({ id: 'alice' });
  assert.equal(alice, sameAlice, 'Concurrent connects share one account load');
  await app.cloud.connect({ id: 'bob' });
  old.resolve(reply({ progress: data(900), revision: 12 }));
  await alice;
  assert.equal(getCount, 2);
  assert.equal(app.progress.load().totalXp, 50);
  assert.equal(app.cloud.status().userId, 'bob');
});

test('a late PUT cannot switch or modify a newly signed-in account', async () => {
  const pendingPut = deferred();
  let gets = 0;
  const app = harness((path, options) => options.method === 'PUT' ? pendingPut.promise :
    reply({ progress: data(++gets === 1 ? 0 : 300), revision: 0 }));
  await app.cloud.connect({ id: 'alice' });
  app.progress.recordAttempt('tables', true, 100);
  const syncing = app.cloud.sync();
  await Promise.resolve();
  app.cloud.disconnect();
  await app.cloud.connect({ id: 'bob' });
  pendingPut.resolve(reply({ progress: data(10), revision: 1 }));
  await syncing;
  assert.equal(app.progress.load().totalXp, 300);
  assert.equal(app.cloud.status().userId, 'bob');
});

test('409 conflicts preserve local work and never silently retry an overwrite', async () => {
  let puts = 0;
  const app = harness((path, options) => {
    if (options.method === 'PUT') { puts++; return reply({ progress: data(800), revision: 3 }, 409); }
    return reply({ progress: data(100), revision: 1 });
  });
  await app.cloud.connect({ id: 'alice' });
  app.progress.recordAttempt('tables', true, 100);
  await app.cloud.sync();
  assert.equal(app.cloud.status().state, 'conflict');
  assert.equal(app.cloud.status().dirty, true);
  assert.equal(app.progress.load().totalXp, 110);
  await app.cloud.sync();
  assert.equal(puts, 1);
});

test('offline account work survives reconnect and clean remote data cannot discard it', async () => {
  let offline = false;
  const app = harness((path, options) => {
    if (offline) throw new Error('Network unavailable');
    return reply(options.method === 'PUT'
      ? { progress: JSON.parse(options.body).progress, revision: 1 }
      : { progress: null, revision: 0 });
  });
  await app.cloud.connect({ id: 'alice' });
  app.progress.recordAttempt('tables', true, 100);
  offline = true;
  await app.cloud.sync();
  assert.equal(app.cloud.status().state, 'offline');
  app.cloud.disconnect();
  offline = false;
  await app.cloud.connect({ id: 'alice' });
  assert.equal(app.progress.load().totalXp, 10);
  await app.cloud.sync();
  assert.equal(app.cloud.status().dirty, false);
});

test('attempts recorded while an upload is pending remain dirty for a second sync', async () => {
  const pending = deferred();
  let puts = 0;
  const app = harness((path, options) => {
    if (options.method !== 'PUT') return reply({ progress: null, revision: 0 });
    puts++;
    return puts === 1 ? pending.promise : reply({ progress: JSON.parse(options.body).progress, revision: 2 });
  });
  await app.cloud.connect({ id: 'alice' });
  app.progress.recordAttempt('tables', true, 100);
  const first = app.cloud.sync();
  await Promise.resolve();
  app.progress.recordAttempt('tables', true, 100);
  pending.resolve(reply({ progress: data(10), revision: 1 }));
  await first;
  assert.equal(app.progress.load().totalXp, 20);
  assert.equal(app.cloud.status().dirty, true);
  await app.cloud.sync();
  assert.equal(app.cloud.status().dirty, false);
  assert.equal(puts, 2);
});

test('legacy pages bootstrap only the authenticated account and remain guest without a session', async () => {
  const guest = harness(() => reply({ user: null, capabilities: { database: false } }), 'https:');
  await guest.cloud.ready;
  assert.equal(guest.cloud.status().state, 'guest');
  assert.equal(guest.calls.length, 1);
  const signedIn = harness(path => reply(path === '/api/me'
    ? { user: { id: 'alice' } } : { progress: data(70), revision: 1 }), 'https:');
  await signedIn.cloud.ready;
  assert.equal(signedIn.cloud.status().userId, 'alice');
  assert.equal(signedIn.progress.load().totalXp, 70);
});

test('explicit cloud recovery preserves a timestamped device backup and never PUTs the server branch', async () => {
  let gets = 0, puts = 0;
  const app = harness((path, options) => {
    if (options.method === 'PUT') { puts++; return reply({ progress: data(800), revision: 3 }, 409); }
    return reply(++gets === 1 ? { progress: data(100), revision: 1 } : { progress: data(800), revision: 3 });
  });
  await app.cloud.connect({ id: 'alice' });
  app.progress.recordAttempt('tables', true, 100);
  await app.cloud.sync();
  const result = await app.cloud.useCloudCopy();
  assert.equal(result.state, 'synced');
  assert.equal(result.recovering, false);
  assert.equal(result.conflict, false);
  assert.equal(result.dirty, false);
  assert.equal(result.revision, 3);
  assert.equal(app.progress.load().totalXp, 800);
  const exported = app.cloud.exportLocal();
  assert.equal(exported.userId, 'alice');
  assert.equal(exported.progress.totalXp, 800);
  assert.equal(exported.backups.length, 1);
  assert.equal(exported.backups[0].progress.totalXp, 110);
  assert.equal(exported.backups[0].revision, 1);
  assert.ok(Number.isFinite(Date.parse(exported.backups[0].savedAt)));
  assert.equal(JSON.parse(app.memory.get('mathRushCloudBackupsV1:alice'))[0].progress.totalXp, 110);
  exported.backups[0].progress.totalXp = 0;
  assert.equal(app.cloud.exportLocal().backups[0].progress.totalXp, 110, 'Export objects cannot mutate stored backups');
  await app.cloud.sync();
  assert.equal(puts, 1, 'Choosing cloud progress only reads the server; it never replaces its branch');
});

test('late recovery GET cannot overwrite another account or expose its backups', async () => {
  const old = deferred();
  let gets = 0;
  const app = harness((path, options) => {
    if (options.method === 'PUT') return reply({ progress: data(80), revision: 2 }, 409);
    gets++;
    if (gets === 2) return old.promise;
    return reply({ progress: data(gets === 1 ? 10 : 300), revision: gets === 1 ? 1 : 4 });
  });
  await app.cloud.connect({ id: 'alice' });
  app.progress.recordAttempt('tables', true, 100);
  await app.cloud.sync();
  const recovering = app.cloud.useCloudCopy();
  await Promise.resolve();
  await app.cloud.connect({ id: 'bob' });
  old.resolve(reply({ progress: data(80), revision: 2 }));
  await recovering;
  assert.equal(app.cloud.status().userId, 'bob');
  assert.equal(app.progress.load().totalXp, 300);
  assert.equal(app.cloud.exportLocal().backups.length, 0, 'A different student cannot export the previous account backup');
  assert.equal(JSON.parse(app.memory.get('mathRushCloudBackupsV1:alice'))[0].progress.totalXp, 20);
});

test('failed cloud recovery leaves dirty conflict data and its backup untouched', async () => {
  let gets = 0;
  const app = harness((path, options) => {
    if (options.method === 'PUT') return reply({ progress: data(80), revision: 2 }, 409);
    return ++gets === 1 ? reply({ progress: data(10), revision: 1 }) : reply({ message: 'Unavailable' }, 503);
  });
  await app.cloud.connect({ id: 'alice' });
  app.progress.recordAttempt('tables', true, 100);
  await app.cloud.sync();
  await app.cloud.useCloudCopy();
  assert.equal(app.progress.load().totalXp, 20);
  assert.equal(app.cloud.status().conflict, true);
  assert.equal(app.cloud.status().dirty, true);
  assert.equal(app.cloud.exportLocal().backups[0].progress.totalXp, 20);
});

test('new local practice while recovery loads is preserved instead of overwritten', async () => {
  const pending = deferred();
  let gets = 0;
  const app = harness((path, options) => {
    if (options.method === 'PUT') return reply({ progress: data(80), revision: 2 }, 409);
    return ++gets === 1 ? reply({ progress: data(10), revision: 1 }) : pending.promise;
  });
  await app.cloud.connect({ id: 'alice' });
  app.progress.recordAttempt('tables', true, 100);
  await app.cloud.sync();
  const recovering = app.cloud.useCloudCopy();
  await Promise.resolve();
  app.progress.recordAttempt('tables', true, 100);
  pending.resolve(reply({ progress: data(80), revision: 2 }));
  await recovering;
  assert.equal(app.progress.load().totalXp, 30);
  assert.equal(app.cloud.status().conflict, true);
  assert.equal(app.cloud.status().dirty, true);
  assert.equal(app.cloud.exportLocal().backups[0].progress.totalXp, 20);
});

test('a failed durable backup prevents replacing the device branch', async () => {
  let gets = 0;
  const app = harness((path, options) => {
    if (options.method === 'PUT') return reply({ progress: data(80), revision: 2 }, 409);
    gets++;
    return reply({ progress: data(10), revision: 1 });
  });
  await app.cloud.connect({ id: 'alice' });
  app.progress.recordAttempt('tables', true, 100);
  await app.cloud.sync();
  const original = app.localStorage.setItem;
  app.localStorage.setItem = (key, value) => {
    if (key.startsWith('mathRushCloudBackupsV1:')) throw new Error('Quota exceeded');
    original(key, value);
  };
  await app.cloud.useCloudCopy();
  assert.equal(gets, 1, 'Cloud recovery does not proceed when a device backup could not be kept');
  assert.equal(app.progress.load().totalXp, 20);
  assert.equal(app.cloud.status().conflict, true);
  assert.equal(app.cloud.status().dirty, true);
});
