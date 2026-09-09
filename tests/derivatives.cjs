const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const context = { window: {}, Math };
vm.runInNewContext(fs.readFileSync('outputs/derivatives.js', 'utf8'), context);
const d = context.window.MathRushDerivatives;
const solve = (terms) => d.formatPolynomial(d.derivative(terms));

assert.equal(solve([{ coefficient: 1, power: 4 }]), '4x^3');
assert.equal(solve([{ coefficient: 7, power: 3 }]), '21x^2');
assert.equal(solve([{ coefficient: 3, power: 4 }, { coefficient: 2, power: 2 }, { coefficient: -7, power: 0 }]), '12x^3 + 4x');
assert.equal(solve([{ coefficient: 1, power: -2 }]), '-2x^-3');
assert.ok(d.equivalent('12x³ + 4x', '12x^3+4*x'));
assert.ok(!d.equivalent('12x^2 + 4x', '12x^3+4x'));
for (const level of [1, 2, 3]) {
  for (let index = 0; index < 100; index++) {
    const problem = d.generate(level);
    assert.ok(problem.text.startsWith('f(x) = '));
    assert.ok(d.equivalent(problem.answer, problem.displayAnswer));
  }
}
const whiteboard = fs.readFileSync('outputs/derivatives.html', 'utf8');
assert.match(whiteboard, /<canvas[^>]+id="board"/);
assert.match(whiteboard, /pointerdown/);
assert.match(whiteboard, /undo/);
assert.match(whiteboard, /redo/);
console.log('Derivative tests passed');
