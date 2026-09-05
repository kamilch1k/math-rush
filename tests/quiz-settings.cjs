const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('outputs/math-rush.html', 'utf8');
let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
script = script.replace('      ensureModeSettingsControls();', `
      globalThis.quiz = {
        configure: updateSelectedModeConfigFromGlobalControls,
        read: readSettings, build: buildProblem, configs: modeConfigs,
        setState(mode, active, remaining) { selectedMode = mode; gameActive = active; timeLeft = remaining; },
        state() { return { timeLeft, settings }; }
      }; return;
      ensureModeSettingsControls();`);
const elements = new Map();
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, { value: id === 'factorTo' ? '10' : '1', style: {}, classList: { toggle() {} }, setAttribute() {} });
    return elements.get(id);
  },
  querySelectorAll() { return []; }, querySelector() { return null; }
};
const context = { document };
vm.runInNewContext(script, context);
const q = context.quiz;
assert.ok(Object.values(q.configs).every(c => c.startTime === 90), 'Every quiz defaults to 90 seconds');
let zeroProblems = 0;
for (let i = 0; i < 2000; i++) {
  const p = q.build('addition-ten');
  if (/(^|[^0-9])0([^0-9]|$)/.test(p.text) || p.answer === 0) zeroProblems++;
}
assert.ok(zeroProblems < 240, 'Zero problems are uncommon (under 12%)');
q.read();
q.configure({ id: 'startTime', value: '20' });
q.read();
assert.ok(Object.values(q.configs).every(c => c.startTime === 20), 'Menu time applies to every quiz');
q.configure({ id: 'startTime', value: '240' });
q.read();
assert.ok(Object.values(q.configs).every(c => c.startTime === 240), 'Extended 240-second timer applies to every quiz');
q.configure({ id: 'startTime', value: '20' });
q.read();
q.configs.tables.startTime = 90;
q.setState('tables', false, 0);
q.read();
assert.equal(q.state().settings.startTime, 90, 'Per-card override survives starting its quiz');
q.setState('tables', true, 80);
q.configure({ id: 'startTime', value: '60' });
q.read();
assert.equal(q.state().timeLeft, 50, 'Changing timer preserves elapsed 10 seconds');
q.read();
assert.equal(q.state().timeLeft, 50, 'Closing settings does not apply time twice');
q.configure({ id: 'timeBonus', value: '5' });
q.read();
assert.equal(q.state().timeLeft, 50, 'Bonus change does not reset timer');
assert.equal(q.configs.addition.startTime, 20, 'In-game changes affect only active quiz');
for (let i = 0; i < 1000; i++) {
  const p = q.build('addition-ten');
  const [, a, b] = p.text.match(/^(\d+) \+ (\d+) = \?$/);
  assert.ok(+a >= 0 && +a <= 10 && +b >= 0 && +b <= 10);
  assert.ok(p.answer <= 10);
  assert.equal(p.answer, +a + +b);
}
for (let i = 0; i < 1000; i++) {
  const p = q.build('subtraction-ten');
  const [, a, b] = p.text.match(/^(\d+) − (\d+) = \?$/);
  assert.ok(+a >= 0 && +a <= 10 && +b >= 0 && +b <= 10);
  assert.ok(p.answer >= 0 && p.answer <= 10);
  assert.equal(p.answer, +a - +b);
}
for (let i = 0; i < 1000; i++) {
  const p = q.build('addition-subtraction');
  const [, a, b, c] = p.text.match(/^(\d+) \+ (\d+) − (\d+) = \?$/);
  assert.equal(p.answer, +a + +b - +c);
  assert.ok(p.answer >= 0);
}
for (let i = 0; i < 1000; i++) {
  const addition = q.build('equations-addition');
  const subtraction = q.build('equations-subtraction');
  assert.match(addition.text, /^x \+ \d+ = \d+$/);
  assert.match(subtraction.text, /^x - \d+ = \d+$/);
  assert.ok(addition.answer >= 0 && addition.answer <= 10);
  assert.ok(subtraction.answer >= 0 && subtraction.answer <= 10);
}
console.log('PASS: timers and 4000 generated problems across new beginner modes');
