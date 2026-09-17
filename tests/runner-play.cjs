// Headless playtest for the gate runner (outputs/runner.html).
// Boots the real page script in a stubbed DOM, then *plays*: steers, passes
// gates, hits spikes, dies, restarts — asserting the rules hold end to end.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join('outputs', 'runner.html'), 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/g)]
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
function makeElement() {
  return {
    textContent: '', disabled: false, dataset: {}, style: {},
    classList: makeClassList(), handlers: {},
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
    setAttribute() {},
    getContext() { return ctxProxy; },
    getBoundingClientRect() { return { width: 800, height: 420, left: 0, top: 0, right: 800, bottom: 420 }; }
  };
}
const elements = new Map();
const docHandlers = {};
const attempts = [];
const store = {};
let simTime = 1000;
let rafCb = null;

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
  window: { devicePixelRatio: 1, innerWidth: 1000, addEventListener() {} },
  document: {
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); },
    addEventListener: (type, fn) => { (docHandlers[type] = docHandlers[type] || []).push(fn); }
  }
};
context.window.window = context.window;
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
const playerY = () => R.state().h - 100;

// 1. boot: autostart, sane initial state
assert.equal(R.state().active, true, 'game autostarts on page load');
assert.equal(R.state().n, 10, 'counter starts at 10');
assert.equal(R.state().hp, 3, 'three lives');
assert.equal(R.state().rows.length, 4, 'four rows ahead');
assert.equal(R.state().w, 800, 'canvas sized from layout');

// 2. steering works
R.state().keys.right = true;
step(30);
assert.ok(R.state().x > 0.5, 'holding right moves the ball right');
R.state().keys.right = false;
R.state().keys.left = true;
const xBefore = R.state().x;
step(10);
assert.ok(R.state().x < xBefore, 'holding left moves the ball left');
R.state().keys.left = false;

// 3. free play resolves rows, scores and records XP
const attemptsBefore = attempts.length;
step(600);
assert.ok(R.state().score > 0, 'playing scores points');
assert.ok(attempts.length > attemptsBefore, 'gates record attempts');
assert.ok(attempts.every((a) => ['addition', 'subtraction', 'multiplication'].includes(a.mode)), 'attempts map to real quiz modes');
assert.ok(attempts.every((a) => typeof a.ok === 'boolean'), 'every gate has a right/wrong verdict');

// 4. gate math is exact: +5 left vs −3 right at n=10
R.start();
attempts.length = 0;
R.state().n = 10;
R.state().x = 0.2;
R.state().rows = [{ y: playerY() - 2, kind: 'gates', gl: { o: '+', v: 5 }, gr: { o: '−', v: 3 }, done: false }];
step(1);
assert.equal(R.state().n, 15, 'left gate applies +5');
assert.equal(attempts.length, 1, 'gate records exactly one attempt');
assert.equal(attempts[0].ok, true, '15 beats 7, so it counts as correct');
assert.equal(attempts[0].mode, 'addition', 'plus gate maps to addition');
R.state().x = 0.8;
R.state().rows = [{ y: playerY() - 2, kind: 'gates', gl: { o: '+', v: 5 }, gr: { o: '−', v: 3 }, done: false }];
step(1);
assert.equal(R.state().n, 12, 'right gate applies −3');
assert.equal(attempts[1].ok, false, '12 loses to 20, so it counts as wrong');

// 5. spikes: pass when strong, bleed when weak
R.start();
R.state().n = 50;
R.state().rows = [{ y: playerY() - 2, kind: 'spike', t: 9999, done: false }];
step(1);
assert.equal(R.state().hp, 2, 'missing the mark costs a life');
R.state().rows = [{ y: playerY() - 2, kind: 'spike', t: 0, done: false }];
const scoreBefore = R.state().score;
step(1);
assert.equal(R.state().hp, 2, 'beating the mark costs nothing');
assert.ok(R.state().score >= scoreBefore + 2, 'smashing spikes bonus scores');

// 6. death ends the run, shows restart, saves best
R.start();
R.state().hp = 1;
R.state().rows = [{ y: playerY() - 2, kind: 'spike', t: 9999, done: false }];
step(1);
assert.equal(R.state().over, true, 'last life lost ends the run');
assert.equal(R.state().active, false, 'loop stops on death');
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

// 8. multiplication gates map to multiplication
R.start();
attempts.length = 0;
R.state().n = 10;
R.state().x = 0.2;
R.state().rows = [{ y: playerY() - 2, kind: 'gates', gl: { o: '×', v: 3 }, gr: { o: '+', v: 1 }, done: false }];
step(1);
assert.equal(R.state().n, 30, 'times gate multiplies');
assert.equal(attempts[0].mode, 'multiplication', 'times gate maps to multiplication');
assert.equal(attempts[0].ok, true, '30 beats 11');

// 9. negative mercy rule: below zero burns to 0 plus a life
R.start();
attempts.length = 0;
R.state().n = 2;
R.state().x = 0.2;
R.state().rows = [{ y: playerY() - 2, kind: 'gates', gl: { o: '−', v: 5 }, gr: { o: '−', v: 9 }, done: false }];
step(1);
assert.equal(R.state().n, 0, 'negative result burns to zero');
assert.equal(R.state().hp, 2, 'going negative costs a life');
assert.equal(attempts[0].ok, true, '-3 still beats -7');

R.stop();
console.log('Runner playtest passed: steering, gates, spikes, death, restart, XP');
