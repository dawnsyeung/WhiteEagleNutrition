import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shipping = fs.readFileSync(new URL('../../../shipping.html', import.meta.url), 'utf8');
const faq = fs.readFileSync(new URL('../../../faq.html', import.meta.url), 'utf8');

test('shipping and FAQ direct customers to checkout instead of obsolete rate promises', () => {
  for (const html of [shipping, faq]) {
    assert.doesNotMatch(html, /\$75|\$6\.95|Subscription deliveries always ship free/);
    assert.match(html, /shipping (?:charges|charge)[\s\S]*?checkout/i);
  }
});

test('shipping page has no unsupported destination exclusion or expedited promise', () => {
  assert.doesNotMatch(shipping, /Expedited 2-day|Hawaii.*launching soon|555-1234/);
  assert.match(shipping, /mailto:info@whiteeaglenutrition\.com/);
});
