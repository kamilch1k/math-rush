// Program curriculum + exam guides (outputs/math-rush.html).
// Executes the real render code with a stub DOM across all five languages:
// stages render, exam cards render, guides open with sections/materials,
// and every practice chip links to an existing quiz card.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('outputs/math-rush.html', 'utf8');
const cardModes = new Set([...html.matchAll(/data-mode="([^"]+)"/g)].map((entry) => entry[1]));
assert.ok(cardModes.size > 40, 'Quiz catalog has modes to link to');

let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // syntax check first
script = script.replace('      ensureModeSettingsControls();', `
      globalThis.__t = {
        renderProgram, renderExams, openExamGuide, jumpToTask, showAppView,
        programText, examsText,
        setLang(l) { currentLanguage = l; },
        byId(id) { return document.getElementById(id); }
      }; return;
      ensureModeSettingsControls();`);

function makeClassList() {
  const set = new Set();
  return {
    add(c) { set.add(c); }, remove(c) { set.delete(c); },
    toggle() {}, contains(c) { return set.has(c); }
  };
}
function makeElement(tag) {
  const el = {
    tag, children: [], textContent: '', className: '', dataset: {},
    style: {}, disabled: false, href: '', target: '', rel: '', type: '', value: '',
    handlers: {}, classList: makeClassList(), offsetWidth: 0,
    append(...nodes) { nodes.flat().forEach((n) => { if (n != null) el.children.push(n); }); return el; },
    appendChild(n) { el.children.push(n); return n; },
    replaceChildren(...nodes) { el.children = nodes.flat().filter((n) => n != null); },
    addEventListener(type, fn) { (el.handlers[type] = el.handlers[type] || []).push(fn); },
    setAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {},
    click() { (el.handlers.click || []).forEach((fn) => fn({ preventDefault() {}, stopPropagation() {}, target: el })); }
  };
  return el;
}
const byId = new Map();
const documentStub = {
  getElementById(id) {
    if (!byId.has(id)) byId.set(id, makeElement('div'));
    return byId.get(id);
  },
  createElement(tag) { return makeElement(tag); },
  querySelectorAll() { return []; },
  querySelector(selector) {
    if (selector === '.mode-grid') return null;
    const mode = /data-mode="([^"]+)"/.exec(selector || '');
    if (mode && cardModes.has(mode[1])) {
      const card = makeElement('article');
      card.dataset.mode = mode[1];
      return card;
    }
    return null;
  },
  addEventListener() {},
  body: makeElement('body')
};
function walk(root, visit) {
  visit(root);
  (root.children || []).forEach((child) => walk(child, visit));
}
function findAll(root, predicate) {
  const found = [];
  walk(root, (node) => { if (predicate(node)) found.push(node); });
  return found;
}

const context = {
  document: documentStub,
  window: { scrollTo() {} },
  history: { replaceState() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  setTimeout() { return 0; }
};
vm.runInNewContext(script, context);
const t = context.__t;
assert.ok(t, 'Test hook exposes program/exam internals');

const languages = ['ru', 'en', 'fr', 'es', 'de'];
for (const lang of languages) {
  assert.ok(t.programText[lang], `Curriculum has ${lang}`);
  assert.ok(t.examsText[lang], `Exam guides have ${lang}`);
}

// ---- curriculum content shape ----
for (const lang of languages) {
  const program = t.programText[lang];
  assert.equal(program.stages.length, 11, `${lang} curriculum has eleven stages`);
  for (const stage of program.stages) {
    assert.ok(stage.grade && stage.title && stage.desc, `${lang} stage has a header`);
    assert.ok(stage.topics.length >= 3, `${lang} stage "${stage.title}" lists topics`);
    assert.ok(stage.modes.length >= 3, `${lang} stage "${stage.title}" links practice modes`);
    for (const mode of stage.modes) assert.ok(cardModes.has(mode), `Curriculum mode ${mode} has a quiz card`);
  }
}

// ---- exam content shape ----
const examIds = ['ege-prof', 'ege-base', 'oge', 'ib-aa', 'ib-ai', 'bagrut', 'sat'];
for (const lang of languages) {
  const pack = t.examsText[lang];
  assert.deepEqual(pack.exams.map((exam) => exam.id).join(','), examIds.join(','), `${lang} covers all seven exams`);
  for (const exam of pack.exams) {
    assert.ok(exam.name && exam.org && exam.format && exam.desc, `${lang} exam ${exam.id} has a header`);
    assert.ok(exam.topics.length >= 7, `${lang} exam ${exam.id} lists required topics`);
    assert.ok(exam.plan.length >= 4, `${lang} exam ${exam.id} has a study plan`);
    assert.ok(exam.method.length > 20, `${lang} exam ${exam.id} explains the method`);
    assert.ok(exam.materials.length >= 2, `${lang} exam ${exam.id} lists materials`);
    for (const material of exam.materials) assert.match(material[1], /^https:\/\//, `${lang} exam ${exam.id} material links out`);
    for (const topic of exam.topics) {
      assert.ok(topic[0], `${lang} exam ${exam.id} topic has a title`);
      if (topic[1]) assert.ok(cardModes.has(topic[1]), `Exam topic ${topic[1]} has a quiz card`);
    }
  }
}

// ---- rendering across languages ----
for (const lang of languages) {
  t.setLang(lang);
  t.renderProgram();
  const host = t.byId('programStages');
  const stages = host.children.filter((node) => node.className === 'program-stage');
  assert.equal(stages.length, 11, `${lang} renders eleven stage cards`);
  const chips = findAll(host, (node) => node.dataset && node.dataset.taskMode);
  assert.ok(chips.length > 40, `${lang} renders practice chips`);
  for (const chip of chips) assert.ok(cardModes.has(chip.dataset.taskMode), `Chip ${chip.dataset.taskMode} links to a quiz card`);

  t.renderExams();
  const grid = t.byId('examsGrid');
  const cards = grid.children.filter((node) => node.className === 'exam-card');
  assert.equal(cards.length, 7, `${lang} renders seven exam cards`);
  for (const examId of examIds) {
    t.openExamGuide(examId);
    const guide = t.byId('examGuide');
    assert.ok(!guide.classList.contains('hidden'), `${lang} guide ${examId} opens`);
    const sections = guide.children.filter((node) => node.className === 'guide-section');
    assert.ok(sections.length >= 4, `${lang} guide ${examId} has format/topics/plan/method/materials`);
    const links = findAll(guide, (node) => node.tag === 'a');
    assert.ok(links.length >= 2, `${lang} guide ${examId} links study materials`);
    assert.ok(links.every((link) => /^https:\/\//.test(link.href)), `${lang} guide ${examId} materials are external`);
    const back = guide.children.find((node) => node.className.includes('guide-back'));
    assert.ok(back, `${lang} guide ${examId} has a back button`);
    back.click();
    assert.ok(!t.byId('examsGrid').classList.contains('hidden'), `${lang} back button returns to exam cards`);
  }
}

// ---- router + task links ----
t.setLang('ru');
t.showAppView('program');
assert.ok(!t.byId('programView').classList.contains('hidden'), 'Program opens from the router');
t.showAppView('exams');
assert.ok(!t.byId('examsView').classList.contains('hidden'), 'Exams open from the router');
t.jumpToTask('tables');
assert.ok(!t.byId('menuScreen').classList.contains('hidden'), 'Topic chip jumps to the tasks view');
assert.doesNotThrow(() => t.jumpToTask('no-such-mode'), 'Unknown modes never break task links');
console.log('Program and exam tests passed');
