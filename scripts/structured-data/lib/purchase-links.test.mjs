import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(path, 'utf8');
const ids = ['46258125406348', '46258125439116', '46258125471884', '46258125504652', '49700309139596', '50004793098380', '49929034498188', '50446087487628'];
test('product hub has direct purchase links for every current displayed variant', () => {
  const html = read('products.html');
  for (const id of ids) assert.ok(html.includes(`href="https://whiteeaglenutrition.myshopify.com/cart/${id}:1"`));
  assert.ok(!html.includes('50453640216716'));
  assert.ok(html.includes('750 LB Tote — $2250.00 USD'));
  assert.ok(!html.includes('1950.00'));
});
test('product detail pages preserve reviews and social links across builds', () => {
  const dried = read('products/2lb-bag-of-whole-dried-black-soldier-fly-larvae-bsfl.html');
  assert.ok(dried.includes('product-reviews-heading'));
  assert.ok(dried.includes('Bryan Hatcher'));
  for (const file of fs.readdirSync('products')) {
    const html = read(`products/${file}`);
    assert.ok(html.includes('class="social-links"'));
    assert.ok(!html.includes('/products?variant='));
  }
  assert.ok(read('index.html').includes('https://earlylight.bio'));
});
test('top-level pages never present the retired demo checkout', () => {
  for (const file of fs.readdirSync('.').filter((file) => file.endsWith('.html'))) {
    assert.ok(!read(file).includes('data-cart-panel'), file);
  }
});
