// Headless playtest for the 3D gate runner (outputs/runner.html).
// Boots the real page script with stubbed DOM + stubbed THREE, then *plays*:
// steers, passes gates, hits spikes, dies, restarts — asserting rules hold.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join('outputs', 'runner.html'), 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc\b)(?![^>]*\btype="module")[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).find((body) => body.trim().length > 0);
assert.ok(inline, 'runner page has an inline game script');
new vm.Script(inline, { filename: 'runner.html' }); // syntax check

// ---- stubs ----
function makeClassList() {
  return { log: [], add(c) { this.log.push(['add', c]); }, remove(c) { this.log.push(['remove', c]); }, toggle() {}, contains() { return false; } };
}
const ctxProxy = new Proxy({}, {
  get(target, prop) { return prop in target ? target[prop] : () => {}; },
  set() { return true; }
});
function mockNode() {
  return {
    position: { x: 0, y: 0, z: 0, set() {} },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { set() {} },
    material: { color: { setHex() {} }, transparent: false, dispose() {} },
    color: { setHex() {} },
    aspect: 1,
    count: 0,
    add() {}, remove() {}, traverse() {},
    setSize() {}, setPixelRatio() {}, render() {}, setClearColor() {},
    lookAt() {}, rotateZ() {}, updateProjectionMatrix() {}, dispose() {},
    setHex() {}, set() {}, setMatrixAt() {}, setColorAt() {}, compose() {}
  };
}
function makeCanvas() {
  const el = makeElement();
  el.width = 0;
  el.height = 0;
  el.clientHeight = 440;
  return el;
}
function makeElement() {
  return {
    textContent: '', disabled: false, dataset: {}, style: { width: 0, height: 0 },
    clientHeight: 0,
    classList: makeClassList(), handlers: {},
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
    setAttribute() {},
    appendChild() {},
    getContext() { return ctxProxy; },
    getBoundingClientRect() { return { width: 800, height: 440, left: 0, top: 0, right: 800, bottom: 440 }; }
  };
}
const elements = new Map();
const docHandlers = {};
const createdCanvases = [];
const attempts = [];
const store = {};
let simTime = 1000;
let rafCb = null;

const THREE = new Proxy({}, { get: () => function Tmp() { return mockNode(); } });

const context = {
  console,
  Math, JSON, Number, String, Boolean, Array, Object, isFinite, parseInt,
  performance: { now: () => simTime },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  },
  MathRushProgress: { recordAttempt: (mode, ok, ms, diff) => attempts.push({ mode, ok, ms, diff }) },
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  cancelAnimationFrame: () => { rafCb = null; },
  window: null,
  document: {
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); },
    createElement: (tag) => {
      const el = tag === 'canvas' ? makeCanvas() : makeElement();
      if (tag === 'canvas') createdCanvases.push(el);
      return el;
    },
    addEventListener: (type, fn) => { (docHandlers[type] = docHandlers[type] || []).push(fn); }
  }
};
context.window = {
  THREE,
  devicePixelRatio: 1, innerWidth: 1000,
  addEventListener() {},
  MathRushRunner: null
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(inline, context);

const R = context.window.MathRushRunner;
assert.ok(R, 'runner exposes a playtest hook');

function step(frames, dtMs = 16.7) {
  for (let i = 0; i < frames; i += 1) {
    if (!rafCb) return false;
    const cb = rafCb;
    rafCb = null;
    simTime += dtMs;
    cb(simTime);
  }
  return true;
}

// 1. boot: autostart, 3D scene up, sane state
assert.equal(R.state().active, true, 'game autostarts on page load');
assert.ok(R.state().scene, 'three.js scene is built');
assert.ok(R.state().crowd, 'ball crowd exists');
assert.equal(R.state().shown, 10, 'ball count matches the counter at start');
assert.equal(R.state().parts.length, 42, 'particle pool is ready');
assert.equal(R.state().n, 10, 'counter starts at 10');
assert.equal(R.state().hp, 3, 'three lives');
assert.equal(R.state().rows.length, 4, 'four rows ahead');
assert.equal(R.state().rows.map((row) => row.kind).join(','), 'gates,gates,gates,spike', 'three gate rows, then spikes');
assert.ok(R.state().rows[3].t >= 3 && R.state().rows[3].t <= 8, 'first wall toll is fair game');
assert.ok(createdCanvases.length > 0, 'gate labels render to canvas textures');

// 2. steering works in world units
R.state().keys.right = true;
step(30);
assert.ok(R.state().x > 0, 'holding right moves the ball right');
R.state().keys.right = false;
const xBefore = R.state().x;
R.state().keys.left = true;
step(10);
assert.ok(R.state().x < xBefore, 'holding left moves the ball left');
R.state().keys.left = false;

// 3. free play resolves rows, scores and records XP
const attemptsBefore = attempts.length;
step(900);
assert.ok(R.state().score > 0, 'playing scores points');
assert.ok(attempts.length > attemptsBefore, 'gates record attempts');
assert.ok(attempts.every((a) => ['addition', 'subtraction', 'multiplication'].includes(a.mode)), 'attempts map to real quiz modes');
assert.ok(attempts.every((a) => typeof a.ok === 'boolean'), 'every gate has a right/wrong verdict');

// 4. gate math is exact: +5 left vs −3 right at n=10 (side flips on x<0)
R.start();
attempts.length = 0;
R.state().n = 10;
R.state().x = -2;
R.state().rows = [{ z: -0.1, kind: 'gates', gl: { o: '+', v: 5 }, gr: { o: '−', v: 3 }, done: false, g: null }];
step(1);
assert.equal(R.state().n, 15, 'left gate applies +5');
assert.equal(R.state().shown, 15, 'ball count follows the counter');
assert.equal(attempts.length, 1, 'gate records exactly one attempt');
assert.equal(attempts[0].ok, true, '15 beats 7, so it counts as correct');
assert.equal(attempts[0].mode, 'addition', 'plus gate maps to addition');
R.state().x = 2;
R.state().rows = [{ z: -0.1, kind: 'gates', gl: { o: '+', v: 5 }, gr: { o: '−', v: 3 }, done: false, g: null }];
step(1);
assert.equal(R.state().n, 12, 'right gate applies −3');
assert.equal(attempts[1].ok, false, '12 loses to 20, so it counts as wrong');

// 5. toll walls: affordable smashes through, coming up short kills instantly
R.start();
attempts.length = 0;
R.state().n = 50;
R.state().rows = [{ z: -0.1, kind: 'spike', t: 5, done: false, g: null }];
step(1);
assert.equal(R.state().n, 45, 'wall takes its toll');
assert.equal(R.state().hp, 3, 'paid toll costs no lives');
assert.equal(R.state().spikes, 1, 'barriers raise the difficulty win or lose');
assert.equal(attempts.length, 1, 'toll records one attempt');
assert.equal(attempts[0].mode, 'subtraction', 'toll maps to subtraction');
assert.equal(attempts[0].ok, true, 'affording the toll counts as correct');
R.state().rows = [{ z: -0.1, kind: 'spike', t: 9999, done: false, g: null }];
step(1);
assert.equal(R.state().over, true, 'unaffordable wall ends the run on the spot');
assert.equal(R.state().hp, 0, 'no change: instant death');
assert.equal(R.state().n, 0, 'crowd is wiped');
assert.equal(attempts[1].ok, false, 'missing the toll counts as wrong');

// 6. death ends the run, shows overlay, saves best
R.start();
R.state().hp = 1;
R.state().rows = [{ z: -0.1, kind: 'spike', t: 9999, done: false, g: null }];
step(1);
assert.equal(R.state().over, true, 'last life lost ends the run');
assert.equal(R.state().active, false, 'loop stops on death');
assert.ok(elements.get('runnerOver').classList.log.some(([op, c]) => op === 'remove' && c === 'hidden'), 'game-over overlay appears');
assert.ok('mathRushRunnerBest' in store, 'best score persists');
const savedBest = R.state().best;
assert.ok(savedBest > 0, 'best score is positive after scoring');

// 7. restart button refills the run and best carries over
const againHandlers = elements.get('runnerAgain').handlers.click || [];
assert.ok(againHandlers.length > 0, 'restart button is wired');
againHandlers.forEach((fn) => fn());
assert.equal(R.state().active, true, 'restart button starts a new run');
assert.equal(R.state().hp, 3, 'restart refills lives');
assert.equal(R.state().n, 10, 'restart resets the counter');
assert.equal(R.state().best, savedBest, 'best carries into the new run');

// 8. Enter restarts after death too
R.state().hp = 1;
R.state().rows = [{ z: -0.1, kind: 'spike', t: 9999, done: false, g: null }];
step(1);
assert.equal(R.state().over, true, 'dead again');
docHandlers.keydown.forEach((fn) => fn({ key: 'Enter', preventDefault() {}, target: { tagName: 'BODY' } }));
assert.equal(R.state().active, true, 'Enter restarts after death');

// 8b. crowd caps at 48 balls for huge counters
R.state().n = 100;
step(1);
assert.equal(R.state().shown, 48, 'crowd caps while the counter keeps the real number');

// 9. multiplication gates map to multiplication
R.start();
attempts.length = 0;
R.state().n = 10;
R.state().x = -2;
R.state().rows = [{ z: -0.1, kind: 'gates', gl: { o: '×', v: 3 }, gr: { o: '+', v: 1 }, done: false, g: null }];
step(1);
assert.equal(R.state().n, 30, 'times gate multiplies');
assert.equal(attempts[0].mode, 'multiplication', 'times gate maps to multiplication');
assert.equal(attempts[0].ok, true, '30 beats 11');

// 10. negative mercy rule: below zero burns to 0 plus a life
R.start();
attempts.length = 0;
R.state().n = 2;
R.state().x = -2;
R.state().rows = [{ z: -0.1, kind: 'gates', gl: { o: '−', v: 5 }, gr: { o: '−', v: 9 }, done: false, g: null }];
step(1);
assert.equal(R.state().n, 0, 'negative result burns to zero');
assert.equal(R.state().hp, 2, 'going negative costs a life');
assert.equal(attempts[0].ok, true, '-3 still beats -7');

R.stop();
console.log('Runner playtest passed: boot, steering, gates, spikes, death, restart, XP');
