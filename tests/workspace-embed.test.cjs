const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const bridgeSource = fs.readFileSync('outputs/workspace-embed.js', 'utf8');
const progressSource = fs.readFileSync('outputs/progress.js', 'utf8');

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, listener, options = {}) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push({ listener, once: options.once });
  };
  target.removeEventListener = (type, listener) => {
    listeners.set(type, (listeners.get(type) || []).filter(item => item.listener !== listener));
  };
  target.dispatchEvent = event => {
    for (const item of [...(listeners.get(event.type) || [])]) {
      if (item.once) target.removeEventListener(event.type, item.listener);
      item.listener(event);
    }
  };
  target.listenerCount = type => (listeners.get(type) || []).length;
  return target;
}

class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
}

function parentRealm(options = {}) {
  const storage = new Map();
  const messages = [];
  const assigned = [];
  const parent = events({
    CustomEvent,
    location: { origin: 'https://math.test', href: 'https://math.test/outputs/workspace.html#learning', hash: '#learning', assign: href => assigned.push(href) },
    document: { documentElement: { lang: options.language || 'ru' } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    postMessage: (message, origin) => messages.push({ message, origin })
  });
  parent.window = parent;
  vm.createContext(parent);
  vm.runInContext(progressSource, parent);
  let userId = null;
  parent.MathRushCloud = { ready: options.ready || Promise.resolve(), status: () => ({ userId }) };
  parent.selectAccount = id => {
    userId = id;
    parent.MathRushProgress.setAccount(id);
    parent.dispatchEvent(new CustomEvent('mathrush:progress', { detail: { accountId: id, source: 'account' } }));
  };
  return { parent, storage, messages, assigned };
}

function childRealm(parent, options = {}) {
  const loaded = [], requests = [], observers = [], frames = new Map();
  const classes = new Set();
  let bodyHeight = 360, frameId = 0;
  const main = { inert: true, getBoundingClientRect: () => ({ top: 0, bottom: bodyHeight, height: bodyHeight }), appendChild() {} };
  const body = { scrollHeight: 50000, getBoundingClientRect: () => ({ top: 0, bottom: bodyHeight, height: bodyHeight }) };
  const description = { content: '' };
  const document = events({
    readyState: 'loading',
    currentScript: { dataset: { app: options.app === undefined ? 'multiplication' : options.app } },
    documentElement: { lang: 'ru', scrollHeight: 80000, classList: { add: value => classes.add(value) } },
    body,
    querySelector: selector => selector === 'main' ? main : selector === 'meta[name="description"]' ? description : null,
    querySelectorAll: () => [],
    createElement: () => ({ dataset: {}, setAttribute() {} }),
    head: {
      appendChild(element) {
        loaded.push(element.src);
        queueMicrotask(() => element.onload());
      }
    }
  });
  const query = options.query === undefined ? '?embedded=1&language=en' : options.query;
  const child = events({
    document, parent, CustomEvent, URL, URLSearchParams,
    location: { origin: 'https://math.test', search: query, href: `https://math.test/outputs/multiplication.html${query}` },
    fetch: (...args) => { requests.push(args); throw new Error('The child must not make an authentication request.'); },
    localStorage: { getItem: () => { throw new Error('Embedded language cannot come from child storage.'); }, setItem: () => { throw new Error('Embedded language cannot update storage.'); } },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this); }
      observe(target) { this.targets.push(target); }
      disconnect() { this.disconnected = true; }
    }
  });
  child.window = child;
  if (options.topLevel) child.parent = child;
  vm.createContext(child);
  vm.runInContext(bridgeSource, child);
  return {
    child, document, main, body, description, classes, loaded, requests, observers, frames,
    start() { document.readyState = 'interactive'; document.dispatchEvent({ type: 'DOMContentLoaded' }); },
    resize(height) { bodyHeight = height; for (const observer of observers) if (!observer.disconnected) observer.callback(); },
    flushFrames() { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } },
    hide() { child.dispatchEvent({ type: 'pagehide' }); }
  };
}

test('embedded startup shares exact parent clients and never loads a second auth/progress client', async () => {
  const { parent } = parentRealm();
  const realm = childRealm(parent);
  assert.equal(realm.child.MathRushProgress, parent.MathRushProgress, 'the alias exists synchronously before any child app script');
  assert.equal(realm.child.MathRushCloud, parent.MathRushCloud);
  assert.equal(realm.child.MathRushEmbed.embedded, true);
  assert.equal(realm.child.MathRushEmbed.language, 'en');
  assert.ok(realm.classes.has('mathrush-embedded'));
  assert.deepEqual(realm.loaded, [], 'scripts wait until the child DOM exists');
  realm.start();
  await realm.child.MathRushEmbed.ready;
  assert.deepEqual(realm.loaded, ['multiplication-core.js', 'multiplication.js']);
  assert.equal(realm.requests.length, 0);
  assert.equal(realm.main.inert, false);
});

test('trainer interactions remain blocked until the shared parent restoration settles', async () => {
  let restore;
  const { parent } = parentRealm({ ready: new Promise(resolve => { restore = resolve; }) });
  const realm = childRealm(parent);
  realm.start();
  for (let count = 0; count < 8; count++) await Promise.resolve();
  assert.deepEqual(realm.loaded, ['multiplication-core.js', 'multiplication.js']);
  assert.equal(realm.main.inert, true, 'loading modules cannot unlock guest attempts during account restoration');
  parent.selectAccount('restored-account');
  restore();
  await realm.child.MathRushEmbed.ready;
  assert.equal(realm.main.inert, false);
  realm.child.MathRushProgress.recordAttempt('tables-7x8', true, 1000);
  assert.equal(parent.MathRushProgress.load().totalXp, 10);
  assert.equal(parent.MathRushProgress.storageKey(), 'mathRushLearningV2:account:restored-account');
});

test('embedded attempts and account switches stay in the parent’s isolated storage and events clean up', async () => {
  const { parent, storage } = parentRealm();
  parent.MathRushProgress.recordAttempt('tables-2x3', true, 1000);
  const realm = childRealm(parent);
  let progressEvents = 0, cloudEvents = 0;
  realm.child.addEventListener('mathrush:progress', () => progressEvents++);
  realm.child.addEventListener('mathrush:cloud', () => cloudEvents++);
  realm.start();
  await realm.child.MathRushEmbed.ready;
  assert.equal(realm.child.MathRushProgress.load().totalXp, 10, 'guest progress is shared, not copied');
  parent.selectAccount('alice');
  assert.equal(realm.child.MathRushProgress.load().totalXp, 0);
  realm.child.MathRushProgress.recordAttempt('tables-7x8', true, 800);
  assert.equal(parent.MathRushProgress.load().totalXp, 10);
  parent.selectAccount('bob');
  assert.equal(realm.child.MathRushProgress.load().totalXp, 0, 'a second learner cannot inherit Alice’s facts');
  realm.child.MathRushProgress.recordAttempt('tables-4x9', false, 900);
  assert.equal(realm.child.MathRushProgress.load().totalXp, 0);
  parent.selectAccount('alice');
  assert.equal(realm.child.MathRushProgress.load().totalXp, 10);
  parent.selectAccount(null);
  assert.equal(realm.child.MathRushProgress.load().totalXp, 10, 'guest practice is preserved through account switches');
  assert.equal(storage.has('mathRushLearningV2:account:alice'), true);
  assert.equal(storage.has('mathRushLearningV2:account:bob'), true);
  parent.dispatchEvent(new CustomEvent('mathrush:cloud', { detail: { state: 'synced' } }));
  assert.equal(cloudEvents, 1);
  assert.ok(progressEvents >= 6);
  assert.equal(parent.listenerCount('mathrush:progress'), 1);
  assert.equal(parent.listenerCount('mathrush:cloud'), 1);
  const before = progressEvents;
  realm.hide();
  assert.equal(parent.listenerCount('mathrush:progress'), 0);
  assert.equal(parent.listenerCount('mathrush:cloud'), 0);
  assert.equal(realm.observers[0].disconnected, true);
  assert.equal(realm.frames.size, 0);
  parent.MathRushProgress.recordAttempt('tables-3x4', true, 700);
  assert.equal(progressEvents, before, 'a removed iframe cannot keep processing account events');
});

test('only a requested same-origin child with both parent clients enters embedded mode', async () => {
  const { parent } = parentRealm();
  const crossOrigin = { location: { origin: 'https://elsewhere.test' }, MathRushProgress: parent.MathRushProgress, MathRushCloud: parent.MathRushCloud };
  const missingClient = { location: parent.location, MathRushProgress: parent.MathRushProgress };
  for (const [candidate, options] of [[parent, { query: '' }], [parent, { topLevel: true }], [crossOrigin, {}], [missingClient, {}]]) {
    const realm = childRealm(candidate, options);
    assert.equal(realm.child.MathRushEmbed.embedded, false);
    assert.equal(realm.child.MathRushProgress, undefined);
    assert.equal(realm.child.MathRushCloud, undefined);
    realm.start();
    await realm.child.MathRushEmbed.ready;
    assert.deepEqual(realm.loaded, ['progress.js', 'cloud-progress.js', 'legacy-cloud.js', 'multiplication-core.js', 'multiplication.js']);
    assert.equal(realm.main.inert, false);
  }
});

test('height messages measure content rather than the iframe viewport and stop after pagehide', async () => {
  const { parent, messages } = parentRealm();
  const realm = childRealm(parent, { app: '' });
  realm.start();
  await realm.child.MathRushEmbed.ready;
  realm.flushFrames();
  assert.equal(realm.observers[0].targets[0], realm.body, 'observe the body, not documentElement');
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), {
    message: { type: 'mathrush:embed-height', height: 360 }, origin: 'https://math.test'
  });
  realm.resize(480);
  realm.flushFrames();
  assert.equal(messages.at(-1).message.height, 480);
  realm.resize(480);
  realm.flushFrames();
  assert.equal(messages.length, 2, 'unchanged content does not trigger height feedback');
  realm.resize(600);
  realm.hide();
  realm.flushFrames();
  assert.equal(messages.length, 2, 'pending callbacks cannot resize a removed frame');
});

function click(document, href, options = {}) {
  const link = { getAttribute: () => href, hasAttribute: () => false };
  const event = { type: 'click', button: 0, target: { closest: () => link }, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, ...options };
  document.dispatchEvent(event);
  return event;
}

test('embedded guide/trainer navigation updates the workspace and preserves local guide anchors', async () => {
  const { parent, assigned } = parentRealm();
  const realm = childRealm(parent, { app: '' });
  realm.start();
  await realm.child.MathRushEmbed.ready;
  assert.equal(click(realm.document, 'multiplication.html').defaultPrevented, true);
  assert.equal(parent.location.hash, 'tables');
  assert.equal(click(realm.document, 'learn.html#multiplication').defaultPrevented, true);
  assert.equal(parent.location.hash, 'learning');
  assert.equal(click(realm.document, '#groups').defaultPrevented, false);
  assert.equal(parent.location.hash, 'learning');
  assert.equal(click(realm.document, 'math-rush.html?skill=fractions').defaultPrevented, true);
  assert.equal(assigned[0], 'https://math.test/outputs/math-rush.html?skill=fractions');
  assert.equal(click(realm.document, 'https://example.test/lesson').defaultPrevented, false);
  assert.equal(click(realm.document, 'multiplication.html', { ctrlKey: true }).defaultPrevented, false);
});

test('embedded guide language follows explicit parent selection without reading child preferences', async () => {
  for (const [parentLanguage, query, expected] of [
    ['ru', '?embedded=1&language=en', 'en'], ['en', '?embedded=1', 'en'], ['ru', '?embedded=1&language=invalid', 'ru']
  ]) {
    const { parent } = parentRealm({ language: parentLanguage });
    const realm = childRealm(parent, { app: '', query });
    vm.runInContext(fs.readFileSync('outputs/learn.js', 'utf8'), realm.child);
    assert.equal(realm.child.MathRushEmbed.language, expected);
    assert.equal(realm.document.documentElement.lang, expected);
    realm.start();
    await realm.child.MathRushEmbed.ready;
  }
});

test('child HTML bootstraps embedding synchronously before app startup and retains standalone headings', () => {
  const guide = fs.readFileSync('outputs/learn.html', 'utf8');
  const trainer = fs.readFileSync('outputs/multiplication.html', 'utf8');
  const bridgeTag = /<script src="workspace-embed\.js"[^>]*><\/script>/;
  for (const source of [guide, trainer]) {
    const tag = source.match(bridgeTag)?.[0];
    assert.ok(tag);
    assert.doesNotMatch(tag, /\b(?:defer|async)\b/);
    assert.ok(source.indexOf(tag) < source.indexOf('</head>'));
    assert.match(source, /class="embed-intro"/);
    assert.match(source, /<h1 /, 'standalone hero retains its original heading');
  }
  assert.ok(guide.indexOf('src="workspace-embed.js"') < guide.indexOf('src="learn.js"'));
  assert.doesNotMatch(trainer, /<script[^>]+src="(?:progress|cloud-progress|legacy-cloud)\.js"/);
  assert.match(trainer, /<main class="page" inert>/);
  const footer = guide.match(/<footer class="learn-footer">([\s\S]*?)<\/footer>/)[1];
  assert.doesNotMatch(footer, /learn-sources/, 'source disclosure is learning content outside the hidden standalone footer');
  assert.match(guide, /<section class="learn-source-section"[^>]*>[\s\S]*?<details class="learn-sources">/);
});
