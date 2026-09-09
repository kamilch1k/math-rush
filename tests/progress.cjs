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
console.log('Progress tests passed');
