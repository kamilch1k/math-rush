const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function realm() {
  const storage = new Map();
  const events = new Map();
  const context = {
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    addEventListener(type, listener) { if (!events.has(type)) events.set(type, []); events.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of events.get(event.type) || []) listener(event); }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('outputs/progress.js', 'utf8'), context);
  let userId = null;
  context.MathRushCloud = { status: () => ({ userId }), ready: Promise.resolve() };
  vm.runInContext(fs.readFileSync('outputs/legacy-cloud.js', 'utf8'), context);
  return { context, storage, setAccount(id) { userId = id; context.MathRushProgress.setAccount(id); } };
}

function profileHooks(context) {
  const source = fs.readFileSync('outputs/math-rush.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const persistence = source.slice(source.indexOf('      function loadProfile()'), source.indexOf('      function updateProfileUI()'));
  const points = source.slice(source.indexOf('      function addProfilePoint()'), source.indexOf('      function randomInt('));
  context.document = { cookie: 'mathRushProfileV1=%7B%22totalScore%22%3A500%7D' };
  vm.runInContext(`
    const PROFILE_STORAGE_KEY = 'mathRushProfileV1';
    let profile = { totalScore: 0 };
    function levelFor(score) { return Math.floor(score / 10) + 1; }
    function updateProfileUI() {}
    ${persistence}
    ${points}
    globalThis.hooks = { loadProfile, saveProfile, addProfilePoint, value: () => profile.totalScore, set: value => { profile.totalScore = value; } };
  `, context);
  return context.hooks;
}

test('legacy score never imports shared V1 storage or cookie into a signed-in account', () => {
  const { context, storage, setAccount } = realm();
  storage.set('mathRushProfileV1', JSON.stringify({ totalScore: 999 }));
  const hooks = profileHooks(context);
  const originalCookie = context.document.cookie;
  hooks.loadProfile();
  assert.equal(hooks.value(), 999);

  setAccount('alice');
  hooks.loadProfile();
  assert.equal(hooks.value(), 0, 'empty account ignores guest V1 storage and cookie');
  hooks.set(1234);
  hooks.saveProfile();
  assert.equal(JSON.parse(storage.get('mathRushProfileV1')).totalScore, 999);
  assert.equal(context.document.cookie, originalCookie, 'account never rewrites the guest cookie');

  context.MathRushProgress.recordAttempt('addition-ten', true, 1000);
  hooks.loadProfile();
  assert.equal(hooks.value(), 1);
  hooks.addProfilePoint();
  assert.equal(hooks.value(), 1, 'recorded account XP is not counted twice by V1 score');
  const aliceKey = context.MathRushLegacy.key('mathRushTestsV1');
  setAccount('bob');
  hooks.loadProfile();
  assert.equal(hooks.value(), 0, 'another empty account cannot inherit Alice’s score');
  assert.notEqual(context.MathRushLegacy.key('mathRushTestsV1'), aliceKey);
  setAccount('alice');
  hooks.loadProfile();
  assert.equal(hooks.value(), 1);
  setAccount(null);
  hooks.loadProfile();
  assert.equal(hooks.value(), 999, 'sign-out restores guest progress without account contamination');
});

function node() {
  return { textContent: '', className: '', children: [], style: {},
    append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); return child; } };
}

test('standalone profile waits for account restoration and reports lifetime skill totals', async () => {
  const { context, setAccount } = realm();
  const elements = new Map();
  context.document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); },
    createElement() { return node(); }
  };
  setAccount('alice');
  context.MathRushProgress.save({ version: 2, totalXp: 6000, attempts: [], skills: {
    addition: { attempts: 700, correctAttempts: 600, xp: 6000, lastPracticedAt: null, recentAttempts: [] }
  }, streakDays: 2, lastActiveDate: null });
  let restore;
  context.MathRushCloud.ready = new Promise(resolve => { restore = resolve; });
  vm.runInContext(fs.readFileSync('outputs/profile.js', 'utf8'), context);
  assert.equal(elements.size, 0, 'no cached-account or guest metrics render before restoration');
  restore();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('attempts').textContent, 700);
  assert.equal(elements.get('correct').textContent, 600);
  assert.equal(elements.get('accuracy').textContent, '86%');
  setAccount('bob');
  context.MathRushProgress.save(context.MathRushProgress.emptyData());
  assert.equal(elements.get('attempts').textContent, 0, 'account event replaces rather than retains former learner totals');
  assert.equal(elements.get('xpText').textContent, '0 XP');
});

test('all legacy practice pages load the account bridge before interactions', () => {
  for (const page of ['math-rush.html', 'math-map.html', 'profile.html', 'derivatives.html', 'runner.html', 'settings.html']) {
    const source = fs.readFileSync(`outputs/${page}`, 'utf8');
    assert.match(source, /<main inert /, `${page} starts with interaction blocked during account restoration`);
    assert.ok(source.indexOf('src="cloud-progress.js"') > source.indexOf('src="progress.js"'));
    assert.ok(source.indexOf('src="legacy-cloud.js"') > source.indexOf('src="cloud-progress.js"'));
  }
});
