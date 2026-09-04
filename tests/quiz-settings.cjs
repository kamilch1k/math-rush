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
q.read();
q.configure({ id: 'startTime', value: '20' });
q.read();
assert.ok(Object.values(q.configs).every(c => c.startTime === 20), 'Menu time applies to every quiz');
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
  assert.ok(+a >= 1 && +a <= 10 && +b >= 1 && +b <= 10);
  assert.equal(p.answer, +a + +b);
}
console.log('PASS: menu timer, per-card timer, live timer adjustment, bonus independence, 1000 beginner additions');
