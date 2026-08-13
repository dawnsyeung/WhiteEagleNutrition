import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildBreadcrumbList,
  buildCollectionPageSchema,
  buildOrganization,
  buildProductSchema,
  buildWebPageSchema,
  buildWebsite,
  canonicalUrl,
  serializeJsonLd,
  withFragment,
} from './lib/schema.mjs';

const ROOT = process.cwd();
const PRODUCTS_HTML_PATH = path.join(ROOT, 'products.html');
const INDEX_HTML_PATH = path.join(ROOT, 'index.html');
const ABOUT_HTML_PATH = path.join(ROOT, 'about.html');
const CONTACT_HTML_PATH = path.join(ROOT, 'contact.html');
const NELLIES_GARDEN_HTML_PATH = path.join(ROOT, 'nellies-garden.html');

const readFile = (filePath) => fs.readFile(filePath, 'utf8');

const writeFile = (filePath, content) => fs.writeFile(filePath, content, 'utf8');

const replaceFirstJsonLdScript = (html, jsonLdObject) => {
  return html.replace(
    /(^[ \t]*)<script type="application\/ld\+json">[\s\S]*?<\/script>/m,
    () => {
      const indent = '    ';
      const bodyIndent = `${indent}  `;
      return `${indent}<script type="application/ld+json">\n${serializeJsonLd(jsonLdObject)
        .split('\n')
        .map((line) => `${bodyIndent}${line}`)
        .join('\n')}\n${indent}</script>`;
    }
  );
};

const extractShopifyConfig = (productsHtml) => {
  const domainMatch = productsHtml.match(/domain:\s*'([^']+)'/);
  const tokenMatch = productsHtml.match(/storefrontAccessToken:\s*'([^']+)'/);
  if (!domainMatch || !tokenMatch) {
    throw new Error('Unable to locate Shopify domain/token in products.html');
  }

  return {
    domain: domainMatch[1],
    token: tokenMatch[1],
  };
};

const extractProductComponentMappings = (productsHtml) => {
  const componentRegex =
    /ui\.createComponent\('product',\s*\{\s*id:\s*'(\d+)'[\s\S]*?node:\s*document\.getElementById\('([^']+)'\)/g;
  const nodeToAnchorMap = {
    'products-dried-component': 'dried-larvae',
    'products-live-component': 'live-larvae',
    'products-frass-component': 'frass-buy',
    'product-component-1780596602393': 'free-bsfl-sample',
  };

  const mappings = [];
  let match;

  while ((match = componentRegex.exec(productsHtml))) {
    const [, productNumericId, nodeId] = match;
    const anchor = nodeToAnchorMap[nodeId];
    if (!anchor) continue;
    mappings.push({
      productGid: `gid://shopify/Product/${productNumericId}`,
      anchor,
    });
  }

  if (!mappings.length) {
    throw new Error('Unable to locate Shopify product component mappings in products.html');
  }

  return mappings;
};

const fetchShopifyProducts = async ({ domain, token, productGids }) => {
  const query = `
    query ProductsByIds($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          handle
          description
          vendor
          featuredImage {
            url
            altText
          }
          images(first: 20) {
            nodes {
              url
              altText
            }
          }
          variants(first: 100) {
            nodes {
              id
              title
              sku
              availableForSale
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(`https://${domain}/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({
      query,
      variables: {
        ids: productGids,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors) {
    throw new Error(`Shopify API returned errors: ${JSON.stringify(payload.errors)}`);
  }

  return payload.data.nodes.filter(Boolean);
};

const buildHomepageGraph = ({ organization, products }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    organization,
    buildWebsite(),
    buildWebPageSchema({
      pagePath: '/',
      name: 'Buy Dried BSFL, Live Larvae & Frass | White Eagle Nutrition',
      description:
        'Buy dried black soldier fly larvae, live larvae, and nutrient-rich frass from White Eagle Nutrition.',
    }),
    buildBreadcrumbList([
      {
        name: 'Home',
        url: canonicalUrl('/'),
      },
    ]),
    {
      '@type': 'ItemList',
      '@id': withFragment('/', 'featured-products'),
      name: 'Featured White Eagle Nutrition products',
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: product.title,
        url: product.url,
      })),
    },
  ],
});

const buildProductsGraph = ({ organization, products }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    organization,
    buildWebsite(),
    buildCollectionPageSchema({
      pagePath: '/products',
      name: 'Shop White Eagle Nutrition',
      description:
        'Shop dried BSFL, live larvae, and frass for chickens, feeders, reptiles, and regenerative gardens.',
    }),
    buildBreadcrumbList([
      {
        name: 'Home',
        url: canonicalUrl('/'),
      },
      {
        name: 'Products',
        url: canonicalUrl('/products'),
      },
    ]),
    {
      '@type': 'ItemList',
      '@id': withFragment('/products', 'itemlist'),
      name: 'White Eagle Nutrition products',
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: product.title,
        url: product.url,
      })),
    },
    ...products.map((product) => product.schema),
  ],
});

const buildAboutGraph = ({ organization }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    organization,
    buildWebsite(),
    {
      '@type': 'AboutPage',
      '@id': withFragment('/about', 'webpage'),
      name: 'About White Eagle Nutrition',
      url: canonicalUrl('/about'),
      description:
        'White Eagle Nutrition develops BSFL nutrition through veterinary science and circular agriculture.',
      isPartOf: {
        '@id': withFragment('/', 'website'),
      },
      about: {
        '@id': withFragment('/', 'organization'),
      },
    },
    buildBreadcrumbList([
      {
        name: 'Home',
        url: canonicalUrl('/'),
      },
      {
        name: 'About',
        url: canonicalUrl('/about'),
      },
    ]),
  ],
});

const buildContactGraph = ({ organization }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    organization,
    buildWebsite(),
    {
      '@type': 'ContactPage',
      '@id': withFragment('/contact', 'webpage'),
      name: 'Contact White Eagle Nutrition',
      url: canonicalUrl('/contact'),
      isPartOf: {
        '@id': withFragment('/', 'website'),
      },
      about: {
        '@id': withFragment('/', 'organization'),
      },
      mainEntity: {
        '@id': withFragment('/', 'organization'),
      },
    },
    buildBreadcrumbList([
      {
        name: 'Home',
        url: canonicalUrl('/'),
      },
      {
        name: 'Contact',
        url: canonicalUrl('/contact'),
      },
    ]),
  ],
});

const fixNelliesGardenTwitterDescription = (html) =>
  html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    '<meta name="twitter:description" content="See Nellie\'s Garden frass products, benefits, and use cases inside White Eagle Nutrition\'s regenerative agriculture ecosystem." />'
  );

const run = async () => {
  const [productsHtml, indexHtml, aboutHtml, contactHtml, nelliesGardenHtml] = await Promise.all([
    readFile(PRODUCTS_HTML_PATH),
    readFile(INDEX_HTML_PATH),
    readFile(ABOUT_HTML_PATH),
    readFile(CONTACT_HTML_PATH),
    readFile(NELLIES_GARDEN_HTML_PATH),
  ]);

  const shopifyConfig = extractShopifyConfig(productsHtml);
  const productMappings = extractProductComponentMappings(productsHtml);
  const shopifyProducts = await fetchShopifyProducts({
    ...shopifyConfig,
    productGids: productMappings.map((mapping) => mapping.productGid),
  });

  const productById = new Map(shopifyProducts.map((product) => [product.id, product]));
  const mappedProducts = productMappings
    .map((mapping) => ({
      mapping,
      product: productById.get(mapping.productGid),
    }))
    .filter(({ product }) => Boolean(product))
    .map(({ mapping, product }) => {
      const productUrl = `${canonicalUrl('/products')}#${mapping.anchor}`;
      return {
        ...product,
        url: productUrl,
        schema: buildProductSchema({ product, productUrl }),
      };
    });

  const organization = buildOrganization({
    description:
      'Texas-rooted black soldier fly larvae nutrition and frass for animals and regenerative gardens.',
    logoUrl: canonicalUrl('/assets/images/logo.png'),
    sameAs: [
      'https://www.instagram.com/whiteeaglenutrition',
      'https://www.facebook.com/whiteeaglenutrition',
      'https://www.linkedin.com/company/whiteeaglenutrition',
    ],
    email: 'info@whiteeaglenutrition.com',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '4979 FM 2502',
      addressLocality: 'Bleiblerville',
      addressRegion: 'TX',
      postalCode: '78931',
      addressCountry: 'US',
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        email: 'info@whiteeaglenutrition.com',
        availableLanguage: 'English',
      },
    ],
  });

  const updatedIndexHtml = replaceFirstJsonLdScript(
    indexHtml,
    buildHomepageGraph({ organization, products: mappedProducts })
  );
  const updatedProductsHtml = replaceFirstJsonLdScript(
    productsHtml,
    buildProductsGraph({ organization, products: mappedProducts })
  );
  const updatedAboutHtml = replaceFirstJsonLdScript(aboutHtml, buildAboutGraph({ organization }));
  const updatedContactHtml = replaceFirstJsonLdScript(contactHtml, buildContactGraph({ organization }));
  const updatedNelliesGardenHtml = fixNelliesGardenTwitterDescription(nelliesGardenHtml);

  await Promise.all([
    writeFile(INDEX_HTML_PATH, updatedIndexHtml),
    writeFile(PRODUCTS_HTML_PATH, updatedProductsHtml),
    writeFile(ABOUT_HTML_PATH, updatedAboutHtml),
    writeFile(CONTACT_HTML_PATH, updatedContactHtml),
    writeFile(NELLIES_GARDEN_HTML_PATH, updatedNelliesGardenHtml),
  ]);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
