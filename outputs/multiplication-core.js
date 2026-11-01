(function (root) {
  'use strict';
  const DAY = 86400000;
  const valid = n => Number.isInteger(n) && n >= 1 && n <= 12;
  function key(a, b) {
    if (!valid(a) || !valid(b)) throw new RangeError('Factors must be integers from 1 to 12.');
    return `${Math.min(a, b)}x${Math.max(a, b)}`;
  }
  function facts(table = 'all') {
    const selected = table === 'all' ? Array.from({ length: 11 }, (_, i) => i + 2) : [Number(table)];
    const result = new Map();
    selected.forEach(a => {
      for (let b = 1; b <= 12; b++) {
        const id = key(a, b);
        if (!result.has(id)) result.set(id, { a, b, key: id });
      }
    });
    return [...result.values()];
  }
  function history(attempts = []) {
    const result = new Map();
    attempts.forEach(attempt => {
      const match = /^tables-(guided-)?(\d{1,2})x(\d{1,2})$/.exec(attempt.problemType || '');
      if (!match) return;
      const a = Number(match[2]), b = Number(match[3]);
      if (!valid(a) || !valid(b)) return;
      const id = key(a, b), previous = result.get(id);
      const independent = attempt.isCorrect === true && !match[1];
      const time = Date.parse(attempt.createdAt);
      if (!Number.isFinite(time)) return;
      const day = new Date(time).toISOString().slice(0, 10);
      const streak = independent ? Math.max(1, (previous?.streak || 0) + (previous?.lastSuccessfulDay === day ? 0 : 1)) : 0;
      result.set(id, {
        a, b, key: id, attempts: (previous?.attempts || 0) + 1,
        streak, needsHelp: !independent, time,
        lastSuccessfulDay: independent ? day : previous?.lastSuccessfulDay,
        due: independent ? time + [0, DAY, 3 * DAY, 7 * DAY, 14 * DAY][Math.min(streak, 4)] : time
      });
    });
    return result;
  }
  function choose(pool, summaries, recent = [], review = false, random = Math.random, now = Date.now()) {
    if (!pool.length) throw new RangeError('A practice pool is required.');
    const excluded = new Set(recent.slice(-2));
    let candidates = pool.filter(fact => !excluded.has(fact.key));
    if (!candidates.length) candidates = pool;
    const weights = candidates.map(fact => {
      const item = summaries.get(fact.key);
      return item?.needsHelp ? 9 : !item ? (review ? 2 : 4) : item.due <= now ? 5 : 1;
    });
    let pick = Math.min(0.999999999, Math.max(0, random())) * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < candidates.length; i++) {
      pick -= weights[i];
      if (pick < 0) return candidates[i];
    }
    return candidates.at(-1);
  }
  function question(fact, format = 'multiply', random = Math.random) {
    key(fact.a, fact.b);
    if (format === 'mix') format = ['multiply', 'missing', 'divide'][Math.min(2, Math.floor(random() * 3))];
    const { a, b } = fact, product = a * b;
    if (format === 'divide') return { fact, format, prompt: `${product} ÷ ${a} = ?`, expected: b };
    if (format === 'missing') return { fact, format, prompt: `${a} × ? = ${product}`, expected: b };
    return { fact, format: 'multiply', prompt: `${a} × ${b} = ?`, expected: product };
  }
  function strategy(a, b, language = 'ru') {
    key(a, b);
    const t = (x, y) => language === 'ru' ? x : y;
    const group = {
      1: t('Одна группа: число остаётся тем же.', 'One group: the number stays the same.'),
      2: t(`Удвой ${b}: сложи ${b} + ${b}.`, `Double ${b}: add ${b} + ${b}.`),
      3: t(`Найди 2 × ${b}, затем прибавь ещё ${b}.`, `Find 2 × ${b}, then add another ${b}.`),
      4: t(`Удвой ${b}, затем удвой результат ещё раз.`, `Double ${b}, then double the result again.`),
      5: t(`Найди 10 × ${b} и раздели результат пополам.`, `Find 10 × ${b} and halve the result.`),
      6: t(`Сложи 5 × ${b} и ещё одну группу ${b}.`, `Add 5 × ${b} and one more group of ${b}.`),
      7: t(`Разбей на знакомые группы: 5 × ${b} + 2 × ${b}.`, `Split into familiar groups: 5 × ${b} + 2 × ${b}.`),
      8: t(`Удвой ${b} три раза: ×2 → ×4 → ×8.`, `Double ${b} three times: ×2 → ×4 → ×8.`),
      9: t(`Возьми 10 × ${b} и вычти одну группу ${b}.`, `Take 10 × ${b} and subtract one group of ${b}.`),
      10: t(`Это ${b} десятков.`, `This is ${b} tens.`),
      11: t(`Разбей на 10 × ${b} + ${b}.`, `Split into 10 × ${b} + ${b}.`),
      12: t(`Разбей на 10 × ${b} + 2 × ${b}.`, `Split into 10 × ${b} + 2 × ${b}.`)
    };
    return group[a];
  }
  function answer(value) {
    const text = String(value).trim();
    return /^\d{1,3}$/.test(text) ? Number(text) : null;
  }
  const api = { key, facts, history, choose, question, strategy, answer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MathRushMultiplication = api;
})(typeof window === 'undefined' ? globalThis : window);
