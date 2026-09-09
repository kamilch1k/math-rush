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
assert.match(quizPage, /content: '⚙'/, 'Quiz cards use an explicit settings gear');
assert.match(quizPage, /handwritingAnswer/, 'Per-quiz settings expose the handwriting option');
assert.match(quizPage, /HANDWRITING_ENABLED = false/, 'Unavailable handwriting cannot be selected before backend setup');
assert.match(quizPage, /data-app-view="tasks"/, 'Tasks are an internal app view');
assert.match(quizPage, /id="mapView"/, 'Knowledge map is embedded in the main app');
assert.match(quizPage, /id="profileView"/, 'Profile is embedded in the main app');
assert.match(quizPage, /id="settingsBackdrop"/, 'Settings use a modal backdrop');
assert.doesNotMatch(quizPage, /href="settings\.html"/, 'Settings no longer navigate away from the app');
console.log('Site smoke tests passed');
