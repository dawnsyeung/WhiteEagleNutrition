const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function checkCoverage(base) {
  const pages = fs.readdirSync(base).filter(name => name.endsWith('.html'));
  for (const name of fs.readdirSync(path.join(base, 'products'))) {
    if (name.endsWith('.html')) pages.push('products/' + name);
  }
  for (const page of pages) {
    const html = fs.readFileSync(path.join(base, page), 'utf8');
    if (page === 'research.html') {
      assert.match(html, /http-equiv="refresh"/);
      assert.match(html, /ethics\.html/);
      continue;
    }
    const inline = (html.match(/posthog\.init\s*\(/g) || []).length;
    const external = (html.match(/src="\/posthog\.js"/g) || []).length;
    assert.equal(inline + external, 1, page + ' must initialize analytics exactly once');
  }
  assert.ok(fs.existsSync(path.join(base, 'posthog.js')));
}
test('all substantive source pages initialize PostHog exactly once', () => checkCoverage(root));
test('product generator retains analytics through rebuilds', () => {
  const generator = fs.readFileSync(path.join(root, 'scripts/structured-data/generate.mjs'), 'utf8');
  assert.match(generator, /<script src="\/posthog\.js" defer><\/script>/);
});
if (fs.existsSync(path.join(root, 'public/index.html'))) {
  test('built public pages retain complete analytics coverage', () => checkCoverage(path.join(root, 'public')));
}
