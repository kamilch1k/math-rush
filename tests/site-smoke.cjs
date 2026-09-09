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
console.log('Site smoke tests passed');
