const SITE_URL = 'https://www.whiteeaglenutrition.com';

const cleanObject = (value) => {
  if (Array.isArray(value)) {
    const cleanedItems = value
      .map((item) => cleanObject(item))
      .filter((item) => item !== undefined && item !== null);
    return cleanedItems.length ? cleanedItems : undefined;
  }

  if (value && typeof value === 'object') {
    const cleanedEntries = Object.entries(value)
      .map(([key, nestedValue]) => [key, cleanObject(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== undefined && nestedValue !== null);
    if (!cleanedEntries.length) return undefined;
    return Object.fromEntries(cleanedEntries);
  }

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return value;
};

const normalizePath = (path) => {
  if (!path) return '/';
  const withoutProtocol = String(path).replace(/^https?:\/\/[^/]+/i, '');
  const withoutHashOrQuery = withoutProtocol.split('#')[0].split('?')[0];
  const trimmed = withoutHashOrQuery.trim();
  if (!trimmed || trimmed === '/') return '/';

  if (trimmed.endsWith('.html')) {
    return `/${trimmed.replace(/^\/+/, '').replace(/\.html$/i, '')}`;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const canonicalUrl = (path = '/') => `${SITE_URL}${normalizePath(path)}`;

const withFragment = (path, fragment) => `${canonicalUrl(path)}#${fragment}`;

const serializeJsonLd = (value) =>
  JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const buildOrganization = ({
  description,
  logoUrl,
  sameAs = [],
  email,
  address,
  contactPoint,
}) =>
  cleanObject({
    '@type': 'Organization',
    '@id': withFragment('/', 'organization'),
    name: 'White Eagle Nutrition',
    url: canonicalUrl('/'),
    logo: logoUrl,
    description,
    sameAs,
    email,
    address,
    contactPoint,
  });

const buildWebsite = () =>
  cleanObject({
    '@type': 'WebSite',
    '@id': withFragment('/', 'website'),
    name: 'White Eagle Nutrition',
    url: canonicalUrl('/'),
    publisher: {
      '@id': withFragment('/', 'organization'),
    },
    inLanguage: 'en-US',
  });

const buildBreadcrumbList = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) =>
    cleanObject({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })
  ),
});

const availabilityUrl = (availableForSale) =>
  availableForSale ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';

const variantOfferUrl = (productUrl, variantId) => {
  const numericVariantId = String(variantId || '').split('/').pop();
  if (!numericVariantId) return productUrl;
  const [baseAndQuery, hash = ''] = productUrl.split('#');
  const joinChar = baseAndQuery.includes('?') ? '&' : '?';
  const withVariant = `${baseAndQuery}${joinChar}variant=${numericVariantId}`;
  return hash ? `${withVariant}#${hash}` : withVariant;
};

const buildOffersFromVariants = (variants, productUrl) => {
  const offers = variants.map((variant) =>
    cleanObject({
      '@type': 'Offer',
      url: variantOfferUrl(productUrl, variant.id),
      priceCurrency: variant.price.currencyCode,
      price: Number(variant.price.amount).toFixed(2),
      availability: availabilityUrl(variant.availableForSale),
      itemCondition: 'https://schema.org/NewCondition',
      sku: variant.sku || undefined,
      name: variant.title !== 'Default Title' ? variant.title : undefined,
    })
  );

  if (offers.length === 1) return offers[0];
  return offers;
};

const buildProductSchema = ({ product, productUrl }) => {
  const images = (product.images?.nodes || [])
    .map((imageNode) => imageNode.url)
    .filter(Boolean);
  const fallbackImage = product.featuredImage?.url ? [product.featuredImage.url] : [];
  const uniqueImages = [...new Set(images.length ? images : fallbackImage)];
  const variants = product.variants?.nodes || [];
  const hasAnySku = variants.some((variant) => Boolean(variant.sku));

  return cleanObject({
    '@type': 'Product',
    '@id': withFragment(productUrl, `product-${product.handle}`),
    name: product.title,
    description: product.description,
    image: uniqueImages,
    url: productUrl,
    brand: {
      '@type': 'Brand',
      name: 'White Eagle Nutrition',
    },
    sku: hasAnySku && variants.length === 1 ? variants[0].sku : undefined,
    offers: buildOffersFromVariants(variants, productUrl),
  });
};

const buildCollectionPageSchema = ({ pagePath, name, description }) =>
  cleanObject({
    '@type': 'CollectionPage',
    '@id': withFragment(pagePath, 'webpage'),
    name,
    url: canonicalUrl(pagePath),
    description,
    isPartOf: {
      '@id': withFragment('/', 'website'),
    },
    about: {
      '@id': withFragment('/', 'organization'),
    },
  });

const buildWebPageSchema = ({ pagePath, name, description }) =>
  cleanObject({
    '@type': 'WebPage',
    '@id': withFragment(pagePath, 'webpage'),
    name,
    url: canonicalUrl(pagePath),
    description,
    isPartOf: {
      '@id': withFragment('/', 'website'),
    },
    about: {
      '@id': withFragment('/', 'organization'),
    },
  });

export {
  SITE_URL,
  availabilityUrl,
  buildBreadcrumbList,
  buildCollectionPageSchema,
  buildOffersFromVariants,
  buildOrganization,
  buildProductSchema,
  buildWebPageSchema,
  buildWebsite,
  canonicalUrl,
  cleanObject,
  normalizePath,
  serializeJsonLd,
  withFragment,
};
