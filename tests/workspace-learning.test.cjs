const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = ['progress.js', 'cloud-progress.js', 'workspace-views.js', 'workspace.js']
  .map(file => fs.readFileSync(`outputs/${file}`, 'utf8'));
const user = id => ({ id, username: id, displayName: id, role: 'student', languages: [], goal: '', bio: '' });

function harness(hash = '#learning', restoredUser = null, database = false) {
  const storage = new Map(), calls = [], listeners = new Map(), nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: '', innerHTML: '', hidden: false, style: {}, dataset: {},
      addEventListener() {}, close() {}, showModal() {}
    });
    return nodes.get(id);
  }
  const document = {
    documentElement: { lang: 'en' }, title: '',
    body: { dataset: { fullSite: 'https://math-rush-link.rewwernick.workers.dev' } },
    getElementById: id => id === 'learningFrame' ? nodes.get(id) || null : node(id),
    querySelectorAll: () => []
  };
  const localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value))
  };
  localStorage.setItem('mathRushHomeLanguage', 'en');
  const location = { hash, origin: 'https://math.example', protocol: 'https:' };
  const history = { replaceState(_state, _title, value) { location.hash = value; } };
  const fetch = async (path, options) => {
    calls.push({ path, options });
    const data = path === '/api/me' ? { user: restoredUser }
      : path === '/api/capabilities' ? { database, ai: false, tutorInvites: false }
      : path === '/api/progress' ? { progress: null, revision: 0 }
      : path === '/api/dashboard' ? { stats: {}, topics: [], recent: [] }
      : path === '/api/classroom' ? { classroom: null, members: [] }
      : { [path.split('/').at(-1)]: [] };
    return { ok: true, status: 200, json: async () => data };
  };
  const window = {
    location, document, localStorage, fetch, history, AbortController,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    dispatchEvent(event) { (listeners.get(event.type) || []).forEach(fn => fn(event)); },
    setTimeout: () => 1, clearTimeout() {}, scrollTo() {}, MathRushForms() {}
  };
  const context = vm.createContext({ window, document, localStorage, location, history, fetch, URL,
    sessionStorage: { getItem: () => null }, Date, setTimeout: () => 1, clearTimeout() {} });
  source.forEach(script => vm.runInContext(script, context));
  return { app: window.MathRushWorkspace, window, document, location, nodes, node, calls };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('guest Learning routes expose Methods and Times tables inside the workspace', async () => {
  const h = harness();
  await settle();
  const content = h.node('mainContent');
  assert.equal(h.app.state.user, null);
  assert.equal(h.app.tab(), 'learning');
  assert.match(content.innerHTML, /learn\.html\?embedded=1&language=en/);
  assert.match(content.innerHTML, /title="Learning methods"/);
  assert.match(content.innerHTML, /href="#learning" aria-current="page"/);
  assert.doesNotMatch(content.innerHTML, /data-form="auth"/);
  h.location.hash = '#tables';
  h.app.render();
  assert.equal(h.app.tab(), 'tables');
  assert.match(content.innerHTML, /multiplication\.html\?embedded=1&language=en/);
  assert.match(content.innerHTML, /href="#tables" aria-current="page"/);
  assert.match(h.node('workspaceNav').innerHTML, /href="#learning"[^>]*aria-current="page"/);
  assert.doesNotMatch(h.node('workspaceNav').innerHTML, /href="#tables"/,
    'Times tables is a Learning subtab rather than another primary nav entry');
  h.app.state.language = 'ru';
  h.app.render();
  assert.match(content.innerHTML, /language=ru/);
  assert.match(content.innerHTML, /title="Таблица умножения"/);
});

test('restored cookie account is reused once and auth still skips to Today', async () => {
  const h = harness('#auth', user('alice'), true);
  await settle();
  assert.equal(h.app.state.user.id, 'alice');
  assert.equal(h.window.MathRushCloud.currentUser().id, 'alice');
  assert.equal(h.location.hash, '#today');
  assert.equal(h.calls.filter(call => call.path === '/api/me').length, 1,
    'workspace uses the bridge bootstrap result instead of a second auth request');
  assert.equal(h.calls.filter(call => call.path === '/api/progress').length, 1);
  h.window.MathRushProgress.recordAttempt('tables-7x8', true, 500);
  assert.equal(h.window.MathRushProgress.load().totalXp, 10);
  h.window.MathRushCloud.disconnect();
  assert.equal(h.window.MathRushCloud.currentUser(), null);
  assert.equal(h.window.MathRushProgress.load().totalXp, 0, 'account attempt never becomes guest progress');
});

test('Learning iframe sizing accepts only finite messages from its own current same-origin frame', async () => {
  const h = harness();
  await settle();
  const frame = h.node('learningFrame');
  frame.contentWindow = {};
  const message = (origin, source, height) => h.window.dispatchEvent({
    type: 'message', origin, source, data: { type: 'mathrush:embed-height', height }
  });
  message('https://other.example', frame.contentWindow, 1000);
  message(h.location.origin, {}, 1000);
  message(h.location.origin, frame.contentWindow, Infinity);
  message(h.location.origin, frame.contentWindow, '1000');
  assert.equal(frame.style.height, undefined);
  message(h.location.origin, frame.contentWindow, 750.2);
  assert.equal(frame.style.height, '755px');
  message(h.location.origin, frame.contentWindow, 999999);
  assert.equal(frame.style.height, '20000px');
  message(h.location.origin, frame.contentWindow, -5);
  assert.equal(frame.style.height, '240px');
});

test('static account screen offers a configured full-site choice without redirecting guest learning', async () => {
  const h = harness('#auth');
  await settle();
  assert.equal(h.location.hash, '#auth');
  assert.match(h.node('mainContent').innerHTML, /href="https:\/\/math-rush-link\.rewwernick\.workers\.dev\/"/);
  assert.match(h.node('mainContent').innerHTML, /Open full Math Rush/);
  assert.doesNotMatch(h.node('mainContent').innerHTML, /data-form="auth"/);
  delete h.document.body.dataset.fullSite;
  h.app.render();
  assert.doesNotMatch(h.node('mainContent').innerHTML, /Open full Math Rush/);
  h.location.hash = '#learning';
  h.app.render();
  assert.match(h.node('mainContent').innerHTML, /learn\.html\?embedded=1/);
});
