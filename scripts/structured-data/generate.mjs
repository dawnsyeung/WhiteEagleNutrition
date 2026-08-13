import fs from 'node:fs/promises';
import path from 'node:path';
import {
  availabilityUrl,
  buildBreadcrumbList,
  buildCollectionPageSchema,
  buildOrganization,
  buildProductSchema,
  buildWebPageSchema,
  buildWebsite,
  canonicalUrl,
  serializeJsonLd,
  variantOfferUrl,
  withFragment,
} from './lib/schema.mjs';

const ROOT = process.cwd();
const PRODUCTS_HTML_PATH = path.join(ROOT, 'products.html');
const INDEX_HTML_PATH = path.join(ROOT, 'index.html');
const ABOUT_HTML_PATH = path.join(ROOT, 'about.html');
const CONTACT_HTML_PATH = path.join(ROOT, 'contact.html');
const NELLIES_GARDEN_HTML_PATH = path.join(ROOT, 'nellies-garden.html');
const SITEMAP_XML_PATH = path.join(ROOT, 'sitemap.xml');
const PRODUCT_DETAILS_DIR_PATH = path.join(ROOT, 'products');

const readFile = (filePath) => fs.readFile(filePath, 'utf8');

const writeFile = (filePath, content) => fs.writeFile(filePath, content, 'utf8');

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeMetaDescription = (value) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= 158) return text;
  return `${text.slice(0, 155)}...`;
};

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

const baseSitemapRoutes = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/products', changefreq: 'weekly', priority: '0.95' },
  { path: '/nellies-garden', changefreq: 'monthly', priority: '0.85' },
  { path: '/nellies-bsfl', changefreq: 'monthly', priority: '0.85' },
  { path: '/ethics', changefreq: 'monthly', priority: '0.85' },
  { path: '/about', changefreq: 'monthly', priority: '0.8' },
  { path: '/chief-white-eagle', changefreq: 'monthly', priority: '0.8' },
  { path: '/faq', changefreq: 'monthly', priority: '0.8' },
  { path: '/blog', changefreq: 'weekly', priority: '0.75' },
  { path: '/insights/microbiome', changefreq: 'monthly', priority: '0.7' },
  { path: '/insights/multi-species-feeding', changefreq: 'monthly', priority: '0.7' },
  { path: '/regenerative-agriculture', changefreq: 'monthly', priority: '0.75' },
  { path: '/animal-connection', changefreq: 'monthly', priority: '0.65' },
  { path: '/contact', changefreq: 'monthly', priority: '0.7' },
  { path: '/wholesale-kit', changefreq: 'monthly', priority: '0.65' },
  { path: '/pet-photos-app', changefreq: 'monthly', priority: '0.4' },
];

const buildSitemapXml = (routes) => {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  routes.forEach((route) => {
    lines.push('  <url>');
    lines.push(`    <loc>${canonicalUrl(route.path)}</loc>`);
    lines.push(`    <changefreq>${route.changefreq}</changefreq>`);
    lines.push(`    <priority>${route.priority}</priority>`);
    lines.push('  </url>');
  });
  lines.push('</urlset>');
  return `${lines.join('\n')}\n`;
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
        url: product.detailUrl,
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
        url: product.detailUrl,
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

const buildProductDetailGraph = ({ organization, mappedProduct }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    organization,
    buildWebsite(),
    buildWebPageSchema({
      pagePath: mappedProduct.detailPath,
      name: `${mappedProduct.title} | White Eagle Nutrition`,
      description: sanitizeMetaDescription(mappedProduct.description),
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
      {
        name: mappedProduct.title,
        url: mappedProduct.detailUrl,
      },
    ]),
    mappedProduct.schema,
  ],
});

const renderProductDetailHtml = ({ mappedProduct, jsonLdGraph }) => {
  const firstImage = mappedProduct.images[0] || canonicalUrl('/assets/images/products/basket.png');
  const metaDescription = sanitizeMetaDescription(mappedProduct.description);
  const variantCards = mappedProduct.variants
    .map((variant) => {
      const isInStock = variant.availableForSale;
      const variantUrl = variantOfferUrl(mappedProduct.purchaseBaseUrl, variant.id);
      return `
            <article>
              <h3>${escapeHtml(variant.title === 'Default Title' ? 'Standard option' : variant.title)}</h3>
              <p><strong>Price:</strong> $${Number(variant.price.amount).toFixed(2)} ${escapeHtml(variant.price.currencyCode)}</p>
              <p><strong>Availability:</strong> ${escapeHtml(isInStock ? 'In stock' : 'Out of stock')}</p>
              <p><strong>Condition:</strong> New</p>
              <a class="btn btn-primary" href="${escapeHtml(variantUrl)}">${
                isInStock ? 'Buy this option' : 'View option'
              }</a>
            </article>`;
    })
    .join('\n');

  const imageCards = mappedProduct.images
    .map(
      (imageUrl, index) => `
            <article>
              <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(`${mappedProduct.title} image ${index + 1}`)}" loading="lazy" decoding="async" />
            </article>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(metaDescription)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <title>${escapeHtml(mappedProduct.title)} | White Eagle Nutrition</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/assets/css/style.css" />
    <link rel="icon" type="image/svg+xml" href="/assets/images/favicon.svg" />
    <link rel="canonical" href="${escapeHtml(mappedProduct.detailUrl)}" />
    <meta property="og:type" content="product" />
    <meta property="og:title" content="${escapeHtml(mappedProduct.title)} | White Eagle Nutrition" />
    <meta property="og:description" content="${escapeHtml(metaDescription)}" />
    <meta property="og:url" content="${escapeHtml(mappedProduct.detailUrl)}" />
    <meta property="og:image" content="${escapeHtml(firstImage)}" />
    <meta property="og:site_name" content="White Eagle Nutrition" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(mappedProduct.title)} | White Eagle Nutrition" />
    <meta name="twitter:description" content="${escapeHtml(metaDescription)}" />
    <meta name="twitter:image" content="${escapeHtml(firstImage)}" />
    <script type="application/ld+json">
${serializeJsonLd(jsonLdGraph)
  .split('\n')
  .map((line) => `      ${line}`)
  .join('\n')}
    </script>
  </head>
  <body class="page-product-detail">
    <header class="site-header" id="top">
      <div class="container">
        <a href="/" class="logo" aria-label="White Eagle Nutrition home">
          <span class="logo-mark" aria-hidden="true">🪶</span>
          <span class="logo-wordmark">
            <span class="logo-text">White Eagle Nutrition</span>
          </span>
        </a>
        <button class="nav-toggle" aria-expanded="false" aria-controls="primary-navigation">
          <span class="sr-only">Toggle navigation</span>
          <span class="nav-toggle-bar"></span>
          <span class="nav-toggle-bar"></span>
          <span class="nav-toggle-bar"></span>
        </button>
        <nav id="primary-navigation" class="site-nav" aria-label="Primary">
          <ul>
            <li><a href="/products">Products</a></li>
            <li><a href="/animal-connection">Animal Connection</a></li>
            <li><a href="/ethics">Ethics &amp; Sustainability</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/chief-white-eagle">Chief White Eagle</a></li>
          </ul>
        </nav>
      </div>
    </header>

    <main>
      <section class="page-hero">
        <div class="container page-hero__layout">
          <div class="page-hero__content">
            <p class="eyebrow">White Eagle Nutrition product detail</p>
            <h1>${escapeHtml(mappedProduct.title)}</h1>
            <p>${escapeHtml(mappedProduct.description)}</p>
            <div class="cta__buttons">
              <a class="btn btn-primary" href="${escapeHtml(mappedProduct.purchaseBaseUrl)}">Buy on product hub</a>
              <a class="btn btn-outline" href="/products">Back to all products</a>
            </div>
          </div>
          <div class="page-hero__visual" role="presentation">
            <img src="${escapeHtml(firstImage)}" alt="${escapeHtml(mappedProduct.title)} product image" loading="eager" decoding="async" />
          </div>
        </div>
      </section>

      <section class="values" aria-labelledby="variant-options-heading">
        <div class="container">
          <h2 id="variant-options-heading">Available options and pricing</h2>
          <div class="values__grid">
${variantCards}
          </div>
        </div>
      </section>

      <section class="blog-list" aria-labelledby="product-gallery-heading">
        <div class="container">
          <h2 id="product-gallery-heading">Product images</h2>
          <div class="blog-grid">
${imageCards}
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="container">
        <div class="footer__brand">
          <a href="/" class="logo">
            <span class="logo-text">White Eagle Nutrition</span>
          </a>
          <p class="footer-tagline"><em>Rise.&nbsp;&nbsp; Renew.&nbsp;&nbsp; Thrive.</em></p>
          <p>Premium BSFL nutrition for backyard chickens, live feeder routines, and regenerative gardens.</p>
        </div>
      </div>
      <div class="container footer__legal">
        <p>© <span data-current-year></span> White Eagle Nutrition. All rights reserved.</p>
      </div>
    </footer>

    <a href="#top" class="scroll-top" aria-label="Back to top">↑</a>
    <script src="/assets/js/main.js" defer></script>
  </body>
</html>
`;
};

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
      const detailPath = `/products/${product.handle}`;
      const detailUrl = canonicalUrl(detailPath);
      const purchaseBaseUrl = `${canonicalUrl('/products')}#${mapping.anchor}`;
      return {
        ...product,
        detailPath,
        detailUrl,
        purchaseBaseUrl,
        images: [...new Set((product.images?.nodes || []).map((imageNode) => imageNode.url).filter(Boolean))],
        variants: product.variants?.nodes || [],
        schema: buildProductSchema({
          product,
          productUrl: detailUrl,
          offerBaseUrl: purchaseBaseUrl,
        }),
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

  await fs.mkdir(PRODUCT_DETAILS_DIR_PATH, { recursive: true });
  await Promise.all(
    mappedProducts.map((mappedProduct) => {
      const detailHtml = renderProductDetailHtml({
        mappedProduct,
        jsonLdGraph: buildProductDetailGraph({ organization, mappedProduct }),
      });
      return writeFile(path.join(PRODUCT_DETAILS_DIR_PATH, `${mappedProduct.handle}.html`), detailHtml);
    })
  );

  const sitemapXml = buildSitemapXml([
    ...baseSitemapRoutes,
    ...mappedProducts.map((product) => ({
      path: product.detailPath,
      changefreq: 'weekly',
      priority: '0.9',
    })),
  ]);

  await Promise.all([
    writeFile(INDEX_HTML_PATH, updatedIndexHtml),
    writeFile(PRODUCTS_HTML_PATH, updatedProductsHtml),
    writeFile(ABOUT_HTML_PATH, updatedAboutHtml),
    writeFile(CONTACT_HTML_PATH, updatedContactHtml),
    writeFile(NELLIES_GARDEN_HTML_PATH, updatedNelliesGardenHtml),
    writeFile(SITEMAP_XML_PATH, sitemapXml),
  ]);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
