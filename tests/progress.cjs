const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const memory = new Map();
const localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); }
};
const context = { window: {}, localStorage, Date };
vm.runInNewContext(fs.readFileSync('outputs/progress.js', 'utf8'), context);
const progress = context.window.MathRushProgress;

assert.equal(progress.modeForSkill('addition'), 'addition-ten');
assert.equal(progress.hrefForSkill(progress.skillById('derivatives')), 'derivatives.html');
assert.equal(progress.stateFor(progress.skillById('subtraction')), 'locked');

for (let index = 0; index < 20; index++) progress.recordAttempt('addition-ten', true, 1200, 'simple');
let data = progress.load();
assert.equal(data.totalXp, 200);
assert.equal(data.skills.addition.correctAttempts, 20);
assert.ok(progress.masteryFor('addition', data) >= 80);
assert.equal(progress.stateFor(progress.skillById('subtraction'), data), 'available');

progress.recordAttempt('subtraction-ten', false, 2400, 'simple');
data = progress.load();
assert.equal(data.skills.subtraction.attempts, 1);
assert.equal(data.totalXp, 200, 'Wrong answers do not grant XP');
progress.recordAttempt('limits-basic', true, 3000, 'advanced');
data = progress.load();
assert.equal(data.skills.limits.attempts, 1, 'Calculus attempts map to calculus skills');
assert.equal(progress.modeForSkill('integrals'), 'integrals-basic');
assert.equal(progress.hrefForSkill(progress.skillById('derivative-tangent')), 'math-rush.html?skill=derivative-tangent');

for (let index = 0; index < 520; index++) progress.recordAttempt('tables', true, 500);
data = progress.load();
assert.equal(data.attempts.length, 500, 'Global history remains bounded');
assert.equal(data.attempts.some(attempt => attempt.skillId === 'addition'), false);
assert.equal(data.skills.addition.recentAttempts.length, 20);
assert.equal(data.skills.multiplication.recentAttempts.length, 20);
assert.equal(data.skills.multiplication.attempts, 520, 'Lifetime statistics are not trimmed');
assert.ok(progress.masteryFor('addition', data) >= 80, 'Practicing other skills must not erase mastery');

const old = progress.emptyData();
old.skills.addition = { attempts: 100, correctAttempts: 100, xp: 1000 };
old.attempts = [{ skillId: 'addition', isCorrect: true, difficulty: 'simple' }];
progress.save(old);
assert.equal(progress.load().skills.addition.recentAttempts.length, 1, 'Migration uses only observed history');
assert.ok(progress.masteryFor('addition') < 50, 'Lifetime totals cannot fabricate missing mastery evidence');
progress.setAccount('student-a');
assert.equal(progress.load().totalXp, 0, 'Accounts must not inherit legacy guest scores');
progress.recordAttempt('tables', true, 500);
progress.setAccount('student-b');
assert.equal(progress.load().totalXp, 0, 'Account storage is isolated');
progress.setAccount('student-a');
assert.equal(progress.load().totalXp, 10);
progress.setAccount(null);
assert.equal(progress.load().skills.addition.attempts, 100, 'Switching back restores the guest profile');
console.log('Progress tests passed');
