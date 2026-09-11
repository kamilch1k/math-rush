const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const pages = ['math-rush.html', 'math-map.html', 'profile.html', 'settings.html', 'derivatives.html'];
for (const page of pages) {
  const file = path.join('outputs', page);
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /<meta name="viewport"/, `${page} has a responsive viewport`);
  for (const target of html.matchAll(/(?:href|src)="([^"#?]+)"/g)) {
    const value = target[1];
    if (/^(?:https?:|data:)/.test(value) || value.includes('${')) continue;
    assert.ok(fs.existsSync(path.resolve('outputs', value)), `${page} references existing ${value}`);
  }
  for (const script of html.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)) {
    if (script[1].trim()) new vm.Script(script[1], { filename: page });
  }
}
const quizPage = fs.readFileSync(path.join('outputs', 'math-rush.html'), 'utf8');
assert.match(quizPage, /--settings-icon: url/, 'Settings buttons share a vector gear icon');
assert.match(quizPage, /handwritingAnswer/, 'Per-quiz settings expose the handwriting option');
assert.match(quizPage, /id="choiceAnswers"/, 'Multiple-choice quizzes have a dedicated answer area');
assert.match(quizPage, /id="embeddedKeypad"/, 'Touch devices have an embedded answer keypad');
assert.match(quizPage, /answerInput\.readOnly = embedded/, 'Touch input is readonly to suppress the system keyboard');
assert.match(quizPage, /inputMode = embedded \? 'none'/, 'Touch input disables the system keyboard input mode');
assert.match(quizPage, /function renderEmbeddedKeypad\(\)/, 'The answer keypad is rendered for the active question type');
assert.match(quizPage, /answerKind === 'choice'/, 'Choice quizzes hide text entry and render answer buttons');
assert.match(quizPage, /HANDWRITING_ENABLED = false/, 'Unavailable handwriting cannot be selected before backend setup');
assert.match(quizPage, /data-app-view="tasks"/, 'Tasks are an internal app view');
assert.match(quizPage, /id="mapView"/, 'Knowledge map is embedded in the main app');
assert.match(quizPage, /id="profileView"/, 'Profile is embedded in the main app');
assert.match(quizPage, /globalSettingsBtn\.addEventListener\('mouseenter'/, 'Settings open on pointer hover');
assert.match(quizPage, /languageButton\.addEventListener\('mouseenter'/, 'Language menu opens on pointer hover');
assert.match(quizPage, /mode-settings-button'[\s\S]*button\.addEventListener\('mouseenter'/, 'Card settings open on pointer hover');
assert.match(quizPage, /progressState === 'locked' \? 'available'/, 'Every map node is available for navigation');
assert.match(quizPage, /card\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/, 'Map nodes navigate to their quiz card');
assert.match(quizPage, /class', `dependency-path/, 'Knowledge map draws prerequisite threads');
assert.match(quizPage, /button\.dataset\.skillId = skill\.id/, 'Map nodes expose skill ids for dependency routing');
assert.match(quizPage, /highlightMapNetwork\(branches, skill\.id, true\)/, 'Hovering a map node highlights its dependency network');
assert.match(quizPage, /modes\[skill\.mode\]\?\.\[1\] \|\| mapSkillDescriptions\[currentLanguage\]\[skill\.id\] \|\| ui\.status\[state\]/, 'Map nodes show each topic description instead of availability text');
assert.match(quizPage, /derivatives: 'Скорость изменения функции'/, 'Derivative map node has a topic description');
for (const mode of ['division', 'column-addition', 'column-subtraction', 'column-multiplication', 'arithmetic-chain-addition', 'arithmetic-parentheses', 'arithmetic-order', 'geometry-shapes', 'geometry-angles', 'geometry-triangles', 'geometry-coordinates', 'algebra-inequalities', 'algebra-functions', 'algebra-linear-functions']) assert.match(quizPage, new RegExp(`data-mode="${mode}"`), `${mode} has a quiz card`);
assert.match(quizPage, /addition: 'Сложение'/, 'The map names the addition node by the parent topic');
for (const language of ['ru', 'en', 'fr', 'es', 'de']) assert.match(quizPage, new RegExp(`${language}: \\{ mapTitle:`), `SPA views include ${language} translations`);
assert.match(quizPage, /\.game-screen \.stat-label/, 'Game stat translation is scoped away from profile statistics');
assert.doesNotMatch(quizPage, /href="settings\.html"/, 'Settings no longer navigate away from the app');
console.log('Site smoke tests passed');
