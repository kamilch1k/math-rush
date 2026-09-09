(function (global) {
  'use strict';
  const superscript = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function powerText(power) { return String(power).split('').map((char) => superscript[char]).join(''); }
  function formatTerm(term, display = false) {
    const coefficient = term.coefficient;
    const power = term.power;
    if (coefficient === 0) return '';
    if (power === 0) return String(coefficient);
    const coefficientText = Math.abs(coefficient) === 1 ? (coefficient < 0 ? '-' : '') : String(coefficient);
    const exponent = power === 1 ? '' : display ? powerText(power) : `^${power}`;
    return `${coefficientText}x${exponent}`;
  }
  function formatPolynomial(terms, display = false) {
    const clean = terms.filter((term) => term.coefficient !== 0).sort((a, b) => b.power - a.power);
    if (!clean.length) return '0';
    return clean.map((term, index) => {
      const body = formatTerm({ coefficient: Math.abs(term.coefficient), power: term.power }, display);
      if (index === 0) return term.coefficient < 0 ? `-${body}` : body;
      return `${term.coefficient < 0 ? ' - ' : ' + '}${body}`;
    }).join('');
  }
  function derivative(terms) { return terms.filter((term) => term.power !== 0).map((term) => ({ coefficient: term.coefficient * term.power, power: term.power - 1 })); }
  function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function generate(level = 1) {
    let terms;
    if (Number(level) === 1) terms = [{ coefficient: randomInt(1, 9), power: randomInt(2, 8) }];
    else if (Number(level) === 2) {
      const high = randomInt(3, 8), low = randomInt(1, high - 1);
      terms = [{ coefficient: randomInt(2, 7), power: high }, { coefficient: Math.random() < .5 ? -randomInt(1, 6) : randomInt(1, 6), power: low }, { coefficient: -randomInt(1, 12), power: 0 }];
    } else {
      terms = Math.random() < .5
        ? [{ coefficient: randomInt(1, 5), power: -randomInt(2, 5) }]
        : [{ coefficient: randomInt(1, 5), power: randomInt(2, 5) }, { coefficient: Math.random() < .5 ? -1 : 1, power: -randomInt(2, 5) }];
    }
    const answerTerms = derivative(terms);
    return { terms, text: `f(x) = ${formatPolynomial(terms, true)}`, answer: formatPolynomial(answerTerms, false).replace(/\s+/g, ''), displayAnswer: formatPolynomial(answerTerms, true), kind: 'derivative-whiteboard' };
  }
  function replaceSuperscripts(value) {
    const reverse = Object.fromEntries(Object.entries(superscript).map(([key, val]) => [val, key]));
    return value.replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (match) => `^${[...match].map((char) => reverse[char]).join('')}`);
  }
  function parsePolynomial(value) {
    let text = replaceSuperscripts(String(value).toLowerCase()).replace(/f['′]?\(x\)=/g, '').replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/\*/g, '');
    if (!text) return null;
    if (!/^[+-]/.test(text)) text = `+${text}`;
    const terms = text.match(/[+-](?:\d*x(?:\^-?\d+)?|\d+)/g);
    if (!terms || terms.join('') !== text) return null;
    const result = new Map();
    for (const signed of terms) {
      const raw = signed[0] === '+' ? signed.slice(1) : signed;
      if (!raw.includes('x')) {
        if (!/^-?\d+$/.test(raw)) return null;
        result.set(0, (result.get(0) || 0) + Number(raw));
        continue;
      }
      const match = raw.match(/^(-?\d*)x(?:\^(-?\d+))?$/);
      if (!match) return null;
      const coefficient = match[1] === '' ? 1 : match[1] === '-' ? -1 : Number(match[1]);
      const power = match[2] === undefined ? 1 : Number(match[2]);
      result.set(power, (result.get(power) || 0) + coefficient);
    }
    return [...result.entries()].filter(([, coefficient]) => coefficient !== 0).sort((a, b) => b[0] - a[0]);
  }
  function equivalent(left, right) {
    const a = parsePolynomial(left), b = parsePolynomial(right);
    return Boolean(a && b && JSON.stringify(a) === JSON.stringify(b));
  }
  global.MathRushDerivatives = { derivative, formatPolynomial, generate, parsePolynomial, equivalent };
})(window);
