import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availabilityUrl,
  buildBreadcrumbList,
  buildOrganization,
  buildProductSchema,
  buildWebsite,
  canonicalUrl,
  cleanObject,
  normalizePath,
  serializeJsonLd,
  variantOfferUrl,
} from './schema.mjs';

test('homepage organization schema includes stable id and core properties', () => {
  const organization = buildOrganization({
    description: 'Texas-rooted BSFL nutrition.',
    logoUrl: 'https://www.whiteeaglenutrition.com/assets/images/logo.png',
    sameAs: ['https://www.instagram.com/whiteeaglenutrition'],
  });

  assert.equal(organization['@id'], 'https://www.whiteeaglenutrition.com/#organization');
  assert.equal(organization.name, 'White Eagle Nutrition');
  assert.equal(organization.logo, 'https://www.whiteeaglenutrition.com/assets/images/logo.png');
});

test('homepage website schema references organization publisher', () => {
  const website = buildWebsite();
  assert.equal(website['@id'], 'https://www.whiteeaglenutrition.com/#website');
  assert.deepEqual(website.publisher, {
    '@id': 'https://www.whiteeaglenutrition.com/#organization',
  });
});

test('product schema includes decimal price and offer object', () => {
  const schema = buildProductSchema({
    product: {
      title: 'Frass Soil Amendment, 2lb Bag',
      handle: 'frass-soil-amendment-2lb-bag',
      description: 'Soil amendment.',
      images: {
        nodes: [{ url: 'https://cdn.shopify.com/frass-1.png' }],
      },
      featuredImage: { url: 'https://cdn.shopify.com/frass-1.png' },
      variants: {
        nodes: [
          {
            id: 'gid://shopify/ProductVariant/1',
            title: 'Default Title',
            sku: null,
            availableForSale: true,
            price: { amount: '18', currencyCode: 'USD' },
          },
        ],
      },
    },
    productUrl: 'https://www.whiteeaglenutrition.com/products/frass-soil-amendment-2lb-bag',
    offerBaseUrl: 'https://www.whiteeaglenutrition.com/products#frass-buy',
  });

  assert.equal(schema.offers.price, '18.00');
  assert.equal(schema.offers.priceCurrency, 'USD');
  assert.equal(
    schema.offers.url,
    'https://www.whiteeaglenutrition.com/products?variant=1#frass-buy'
  );
});

test('in-stock availability is mapped correctly', () => {
  assert.equal(availabilityUrl(true), 'https://schema.org/InStock');
});

test('out-of-stock availability is mapped correctly', () => {
  assert.equal(availabilityUrl(false), 'https://schema.org/OutOfStock');
});

test('product schema keeps multiple unique images', () => {
  const schema = buildProductSchema({
    product: {
      title: 'Whole Dried BSFL',
      handle: 'whole-dried-bsfl',
      description: 'Test product.',
      images: {
        nodes: [
          { url: 'https://cdn.shopify.com/a.png' },
          { url: 'https://cdn.shopify.com/b.png' },
          { url: 'https://cdn.shopify.com/a.png' },
        ],
      },
      featuredImage: { url: 'https://cdn.shopify.com/a.png' },
      variants: {
        nodes: [
          {
            id: 'gid://shopify/ProductVariant/1',
            title: 'Default Title',
            sku: null,
            availableForSale: true,
            price: { amount: '19.8', currencyCode: 'USD' },
          },
        ],
      },
    },
    productUrl: 'https://www.whiteeaglenutrition.com/products#dried-larvae',
  });

  assert.deepEqual(schema.image, ['https://cdn.shopify.com/a.png', 'https://cdn.shopify.com/b.png']);
});

test('optional sku is omitted when absent', () => {
  const schema = buildProductSchema({
    product: {
      title: 'Live BSFL',
      handle: 'live-bsfl',
      description: 'Live product.',
      images: { nodes: [{ url: 'https://cdn.shopify.com/live.png' }] },
      featuredImage: { url: 'https://cdn.shopify.com/live.png' },
      variants: {
        nodes: [
          {
            id: 'gid://shopify/ProductVariant/2',
            title: 'Default Title',
            sku: null,
            availableForSale: true,
            price: { amount: '19.8', currencyCode: 'USD' },
          },
        ],
      },
    },
    productUrl: 'https://www.whiteeaglenutrition.com/products#live-larvae',
  });

  assert.equal('sku' in schema, false);
  assert.equal('sku' in schema.offers, false);
});

test('breadcrumb generation outputs ordered list items', () => {
  const breadcrumb = buildBreadcrumbList([
    { name: 'Home', url: 'https://www.whiteeaglenutrition.com/' },
    { name: 'Products', url: 'https://www.whiteeaglenutrition.com/products' },
  ]);

  assert.equal(breadcrumb.itemListElement.length, 2);
  assert.equal(breadcrumb.itemListElement[1].position, 2);
  assert.equal(breadcrumb.itemListElement[1].name, 'Products');
});

test('URL normalization handles html and absolute URLs', () => {
  assert.equal(normalizePath('products.html'), '/products');
  assert.equal(normalizePath('https://www.whiteeaglenutrition.com/about'), '/about');
  assert.equal(canonicalUrl('contact.html'), 'https://www.whiteeaglenutrition.com/contact');
});

test('variant offer URL keeps query before hash fragment', () => {
  assert.equal(
    variantOfferUrl('https://www.whiteeaglenutrition.com/products#live-larvae', 'gid://shopify/ProductVariant/555'),
    'https://www.whiteeaglenutrition.com/products?variant=555#live-larvae'
  );
});

test('JSON serialization escapes unsafe script characters', () => {
  const serialized = serializeJsonLd({
    text: '</script><script>alert(1)</script>',
  });
  assert.ok(!serialized.includes('</script>'));
  assert.ok(serialized.includes('\\u003c/script>'));
});

test('cleanObject removes null and undefined properties', () => {
  const cleaned = cleanObject({
    name: 'White Eagle Nutrition',
    sku: null,
    nested: {
      value: undefined,
      keep: 'ok',
    },
  });

  assert.deepEqual(cleaned, {
    name: 'White Eagle Nutrition',
    nested: {
      keep: 'ok',
    },
  });
});
