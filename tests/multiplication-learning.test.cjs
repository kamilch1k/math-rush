const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../outputs/multiplication-core.js');

test('all fact families grade products, missing factors and exact division correctly', () => {
  for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) {
    const fact = { a, b, key: core.key(a, b) };
    assert.equal(core.question(fact, 'multiply').expected, a * b);
    assert.equal(core.question(fact, 'missing').expected * a, a * b);
    assert.equal(core.question(fact, 'divide').expected, (a * b) / a);
    assert.equal(core.key(a, b), core.key(b, a), 'commuted facts share review history');
    assert.ok(core.strategy(a, b, 'ru'));
    assert.ok(core.strategy(a, b, 'en'));
  }
  assert.equal(core.facts('7').length, 12);
  assert.equal(new Set(core.facts().map(f => f.key)).size, core.facts().length);
  assert.throws(() => core.facts('13'), RangeError);
  assert.throws(() => core.key(1, 0), RangeError);
  for (const input of ['', ' ', '-2', '2.5', '7x8', 'Infinity']) assert.equal(core.answer(input), null);
  assert.equal(core.answer(' 56 '), 56);
});

test('review returns mistakes more often, spaces independent recall and avoids immediate repeats', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const attempt = (mode, correct, time) => ({ problemType: mode, isCorrect: correct, createdAt: new Date(time).toISOString() });
  const history = core.history([
    attempt('tables-7x8', true, now - 2 * 86400000),
    attempt('tables-8x7', true, now),
    attempt('tables-guided-6x7', true, now)
  ]);
  assert.equal(history.get('7x8').streak, 2);
  assert.equal(history.get('7x8').due, now + 3 * 86400000);
  assert.equal(history.get('6x7').needsHelp, true);
  const sameDay = core.history([attempt('tables-7x8', true, now), attempt('tables-8x7', true, now + 1000)]);
  assert.equal(sameDay.get('7x8').streak, 1, 'same-day repetitions do not push a fact straight to a long review interval');
  const pool = [{ a: 7, b: 8, key: '7x8' }, { a: 6, b: 7, key: '6x7' }];
  let needsReview = 0;
  for (let i = 0; i < 100; i++) {
    if (core.choose(pool, history, [], true, () => (i + .5) / 100, now).key === '6x7') needsReview++;
  }
  assert.equal(needsReview, 90);
  assert.equal(core.choose(pool, history, ['6x7'], true, () => .9, now).key, '7x8');
  history.clear();
  assert.ok(core.choose(pool, history, ['7x8', '6x7']).key, 'small exhausted pools remain usable');
});

test('guided facts earn no XP, independent recall records once per call, and accounts stay isolated', () => {
  const storage = new Map();
  const realm = { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } };
  realm.window = realm;
  vm.createContext(realm);
  vm.runInContext(fs.readFileSync('outputs/progress.js', 'utf8'), realm);
  const p = realm.MathRushProgress;
  p.setAccount('alice');
  p.recordAttempt('tables-guided-7x8', true, 3000);
  assert.equal(p.load().totalXp, 0);
  assert.equal(core.history(p.load().attempts).get('7x8').needsHelp, true);
  p.recordAttempt('tables-8x7', true, 1500);
  assert.equal(p.load().totalXp, 10);
  assert.equal(p.load().skills.multiplication.attempts, 2);
  assert.equal(core.history(p.load().attempts).get('7x8').needsHelp, false);
  p.recordAttempt('tables-13x2', true, 1000);
  assert.equal(p.load().skills.multiplication.attempts, 2, 'invalid fact ids cannot be recorded as this skill');
  p.setAccount('bob');
  assert.equal(p.load().attempts.length, 0);
  p.setAccount('alice');
  assert.equal(p.load().totalXp, 10);
});
