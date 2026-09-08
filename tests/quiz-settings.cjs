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
  const p = q.build('addition-twenty');
  const [, a, b] = p.text.match(/^(\d+) \+ (\d+) = \?$/);
  assert.equal(p.answer, +a + +b);
  assert.ok(p.answer >= 11 && p.answer <= 20, 'Second addition level stays between 11 and 20');
}
for (let i = 0; i < 1000; i++) {
  const p = q.build('addition');
  const [, a, b] = p.text.match(/^(\d+) \+ (\d+) = \?$/);
  assert.equal(p.answer, +a + +b);
  assert.ok(p.answer > 20, 'Third addition level always exceeds 20');
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
for (let i = 0; i < 500; i++) {
  const percent = q.build('skills-percent');
  const [, rate, base] = percent.text.match(/^(\d+)% .* (\d+) = \?$/);
  assert.equal(percent.answer, (+rate * +base) / 100, 'Percentage answer is exact');
  const story = q.build('skills-story-equation');
  assert.match(story.answer, /^x\+\d+=\d+$/, 'Story task produces a canonical equation');
  const comparison = q.build('skills-compare');
  assert.ok(['<', '>', '='].includes(comparison.answer), 'Speed comparison has a valid relation');
  const missing = q.build('equations-missing');
  assert.ok(Number.isInteger(missing.answer) && missing.answer > 0, 'Missing-number task has a positive integer answer');
  const multiply = q.build('equations-multiplication');
  assert.match(multiply.text, /^x × \d+ = \d+$/, 'Multiplication equation is generated');
  const divide = q.build('equations-division');
  assert.match(divide.text, /^x \/ \d+ = \d+$/, 'Division equation is generated');
  const twoStep = q.build('equations-two-step');
  assert.match(twoStep.text, /^\d+ × x \+ \d+ = \d+$/, 'Two-step equation is generated');
  for (const mode of ['geometry-perimeter', 'geometry-area', 'geometry-side']) {
    assert.ok(Number.isInteger(q.build(mode).answer), `${mode} has an integer answer`);
  }
  const parity = q.build('olympiad-parity');
  assert.ok(['even', 'odd'].includes(parity.answer), 'Parity task has a canonical answer');
  assert.equal(parity.kind, 'parity', 'Parity task accepts a textual answer');
  const coloring = q.build('olympiad-coloring');
  assert.ok(Number.isInteger(coloring.answer) && coloring.answer > 0, 'Coloring task has a positive integer answer');
  const pattern = q.build('olympiad-patterns');
  assert.ok(Number.isInteger(pattern.answer), 'Pattern task has an integer continuation');
  const logic = q.build('olympiad-logic');
  assert.ok(Number.isInteger(logic.answer) && logic.answer > 0, 'Logic task has a positive integer answer');
}
for (let i = 0; i < 300; i++) {
  const story = q.build('skills-story-equation').text;
  assert.ok(!/Ане.*У него/.test(story), 'Anna uses the feminine pronoun');
  assert.ok(!/(?:Пете|Максу).*У неё/.test(story), 'Male names use the masculine pronoun');
}
console.log('PASS: timers and generated problems across arithmetic, algebra, geometry, and olympiad modes');
