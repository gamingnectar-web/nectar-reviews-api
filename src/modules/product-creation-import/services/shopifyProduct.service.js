const { env } = require('../../../config/env');
const { shopifyFetch, shopifyFetchOptional, getAccessTokenForShop, buildInstallUrl, getShopifyStoreUrl } = require('../../../utils/shopify');
const { cleanText, normaliseTitle, toMoney, normaliseMetafields } = require('../utils/safe');
const { normaliseDraftProduct } = require('./normaliseProduct.service');

function numericId(gidOrId = '') {
  const raw = String(gidOrId || '');
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : raw;
}

function productGid(id = '') {
  const raw = String(id || '').trim();
  if (!raw) return '';
  return raw.startsWith('gid://') ? raw : `gid://shopify/Product/${raw}`;
}

function variantGid(id = '') {
  const raw = String(id || '').trim();
  if (!raw) return '';
  return raw.startsWith('gid://') ? raw : `gid://shopify/ProductVariant/${raw}`;
}

function restProductToCard(product = {}) {
  const firstVariant = product.variants?.[0] || {};
  return {
    id: productGid(product.id),
    legacyResourceId: String(product.id || ''),
    title: product.title || 'Product',
    handle: product.handle || '',
    vendor: product.vendor || '',
    productType: product.product_type || '',
    tags: Array.isArray(product.tags) ? product.tags : String(product.tags || '').split(',').map((x) => x.trim()).filter(Boolean),
    image: product.image?.src || product.images?.[0]?.src || '',
    variantId: firstVariant.id ? variantGid(firstVariant.id) : '',
    legacyVariantId: firstVariant.id ? String(firstVariant.id) : '',
    sku: firstVariant.sku || '',
    barcode: firstVariant.barcode || '',
    price: firstVariant.price || '',
    inventoryQuantity: Number(firstVariant.inventory_quantity || 0),
  };
}

async function shopifyGraphql({ shopDomain, query, variables = {} }) {
  const normalizedShop = getShopifyStoreUrl(shopDomain);
  const accessToken = await getAccessTokenForShop(normalizedShop);
  if (!normalizedShop) {
    const err = new Error('Missing Shopify shop domain.');
    err.code = 'SHOPIFY_SHOP_MISSING';
    throw err;
  }
  if (!accessToken) {
    const err = new Error('This shop has not completed Shopify OAuth install, so no per-shop Admin API token is available yet.');
    err.code = 'SHOPIFY_ACCESS_MISSING';
    throw err;
  }
  const response = await fetch(`https://${normalizedShop}/admin/api/${env.shopifyApiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.errors) {
    const err = new Error(JSON.stringify(json.errors || json));
    err.status = response.status;
    if (response.status === 401 || response.status === 403) err.code = 'SHOPIFY_REINSTALL_REQUIRED';
    throw err;
  }
  return json.data || {};
}

async function shopifyGraphqlOptional(args) {
  try { return await shopifyGraphql(args); }
  catch (error) {
    if (['SHOPIFY_ACCESS_MISSING', 'SHOPIFY_SHOP_MISSING', 'SHOPIFY_REINSTALL_REQUIRED'].includes(error.code)) return null;
    throw error;
  }
}

async function healthCheckShopify(shopDomain) {
  const token = await getAccessTokenForShop(shopDomain);
  return {
    connected: Boolean(token),
    installUrl: buildInstallUrl(shopDomain),
    apiVersion: env.shopifyApiVersion,
    requiredScopes: ['read_products', 'write_products'],
    message: token ? 'Shopify Admin API token is available for product search, product creation, tags and product metafields.' : 'Reconnect/install the app through Shopify OAuth so product import can search and create products.',
  };
}

async function searchShopifyProducts({ shopDomain, q = '', first = 10 }) {
  const queryText = cleanText(q, 160).toLowerCase();
  if (!queryText) return [];
  const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=250&fields=id,title,handle,image,images,variants,tags,vendor,product_type`, { shopDomain });
  if (!data) {
    const error = new Error('Shopify product search needs OAuth or a Shopify Admin token.');
    error.status = 412;
    error.requiresOauth = true;
    error.installUrl = buildInstallUrl(shopDomain);
    throw error;
  }
  const normalisedQuery = normaliseTitle(queryText);
  return (data.products || [])
    .filter((product) => {
      const firstVariant = product.variants?.[0] || {};
      const haystack = [product.title, product.handle, product.id, firstVariant.sku, firstVariant.barcode, product.vendor, product.product_type, product.tags]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(queryText) || normaliseTitle(product.title).includes(normalisedQuery);
    })
    .slice(0, Math.min(Number(first) || 10, 25))
    .map(restProductToCard);
}

function makeRestMetafield(item = {}) {
  const namespace = cleanText(item.namespace || '', 80);
  const key = cleanText(item.key || '', 80);
  const value = item.value === undefined || item.value === null ? '' : String(item.value);
  if (!namespace || !key || value === '') return null;
  return {
    namespace,
    key,
    type: cleanText(item.type || 'single_line_text_field', 80) || 'single_line_text_field',
    value,
  };
}

async function createShopifyProductFromDraft({ shopDomain, draft }) {
  const normalised = normaliseDraftProduct(draft || {});
  const tags = Array.isArray(normalised.tags) ? normalised.tags.join(', ') : String(normalised.tags || '');
  const variant = {
    price: toMoney(normalised.price) || '0.00',
    sku: normalised.sku || undefined,
    barcode: normalised.barcode || undefined,
    inventory_management: 'shopify',
    option1: 'Default Title',
  };
  if (normalised.cost) variant.cost = normalised.cost;

  const metafields = normaliseMetafields([
    ...(normalised.sourceUrl ? [{ namespace: 'external_import', key: 'source_url', type: 'url', value: normalised.sourceUrl }] : []),
    ...(normalised.cost ? [{ namespace: 'external_import', key: 'price_paid', type: 'single_line_text_field', value: String(normalised.cost) }] : []),
    ...(normalised.quantity ? [{ namespace: 'external_import', key: 'invoice_quantity', type: 'number_integer', value: String(Math.round(Number(normalised.quantity) || 1)) }] : []),
    ...(normalised.metafields || []),
  ]).map(makeRestMetafield).filter(Boolean);

  const product = {
    title: normalised.title,
    handle: normalised.handle || undefined,
    body_html: normalised.descriptionHtml || '',
    vendor: normalised.vendor || undefined,
    product_type: normalised.productType || undefined,
    status: 'draft',
    tags,
    variants: [variant],
    images: normalised.images.map((image) => ({ src: image.src, alt: image.alt || normalised.title })).slice(0, 12),
    metafields,
  };

  const result = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/products.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ product }),
  });

  return restProductToCard(result.product || {});
}

async function assignImportLineToProduct({ importDoc, lineId, productId, variantId = '', productTitle = '', handle = '', image = '' }) {
  const line = importDoc.lines.find((item) => item.lineId === lineId);
  if (!line) {
    const error = new Error('Invoice line not found.');
    error.status = 404;
    throw error;
  }
  line.match = { status: 'assigned', score: 1, productId, variantId, productTitle, handle, image, reason: 'Manually assigned to existing Shopify product.' };
  importDoc.status = importDoc.lines.every((item) => ['assigned', 'created'].includes(item.match?.status)) ? 'matched' : 'partial';
  await importDoc.save();
  return importDoc;
}

async function listRecentlyUsedProductTags({ shopDomain, limit = 250 }) {
  const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=${Math.min(Number(limit) || 250, 250)}&fields=id,tags`, { shopDomain });
  if (!data) return [];
  const counts = new Map();
  (data.products || []).forEach((product) => {
    String(product.tags || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })).slice(0, 120);
}

async function getProductMetafieldDefinitions({ shopDomain }) {
  const query = `query ProductMetafieldDefinitions($first: Int!) {
    metafieldDefinitions(first: $first, ownerType: PRODUCT) {
      nodes {
        id
        namespace
        key
        name
        description
        type { name category }
        validations { name value }
      }
    }
  }`;
  const data = await shopifyGraphqlOptional({ shopDomain, query, variables: { first: 100 } });
  const nodes = data?.metafieldDefinitions?.nodes || [];
  const coreFallback = [
    { namespace: 'core', key: 'formula_version', name: 'Formula Version', type: { name: 'single_line_text_field' } },
    { namespace: 'core', key: 'grouped_profiles', name: 'Grouped Profiles', type: { name: 'single_line_text_field' } },
    { namespace: 'core', key: 'sourness', name: 'Sourness', type: { name: 'single_line_text_field' } },
    { namespace: 'core', key: 'sweetness', name: 'Sweetness', type: { name: 'single_line_text_field' } },
    { namespace: 'core', key: 'flavour_profile', name: 'Flavour Profile', type: { name: 'single_line_text_field' } },
  ];
  const byKey = new Map();
  [...coreFallback, ...nodes].forEach((definition) => {
    byKey.set(`${definition.namespace}.${definition.key}`, {
      namespace: definition.namespace,
      key: definition.key,
      name: definition.name || `${definition.namespace}.${definition.key}`,
      description: definition.description || '',
      type: definition.type?.name || definition.type || 'single_line_text_field',
      validations: definition.validations || [],
      isCoreDefault: coreFallback.some((item) => item.namespace === definition.namespace && item.key === definition.key),
    });
  });
  return Array.from(byKey.values()).sort((a, b) => `${a.namespace}.${a.key}`.localeCompare(`${b.namespace}.${b.key}`));
}

async function getProductMetafieldsForRestProduct({ shopDomain, productId }) {
  const id = numericId(productId);
  if (!id) return [];
  const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products/${id}/metafields.json?limit=250`, { shopDomain });
  return data?.metafields || [];
}

async function getProfileValuesFromExistingProducts({ shopDomain, tags = [], vendor = '', productType = '' }) {
  const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=250&fields=id,title,tags,vendor,product_type`, { shopDomain });
  if (!data) return { matchedProductCount: 0, metafields: [] };
  const wantedTags = new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).toLowerCase()));
  const wantedVendor = String(vendor || '').toLowerCase();
  const wantedType = String(productType || '').toLowerCase();
  const candidates = (data.products || []).filter((product) => {
    const productTags = String(product.tags || '').split(',').map((tag) => tag.trim().toLowerCase());
    const tagHit = wantedTags.size ? productTags.some((tag) => wantedTags.has(tag)) : false;
    const vendorHit = wantedVendor && String(product.vendor || '').toLowerCase() === wantedVendor;
    const typeHit = wantedType && String(product.product_type || '').toLowerCase() === wantedType;
    return tagHit || vendorHit || typeHit;
  }).slice(0, 12);

  const counts = new Map();
  for (const product of candidates) {
    const metafields = await getProductMetafieldsForRestProduct({ shopDomain, productId: product.id });
    metafields.forEach((mf) => {
      if (!mf.namespace || !mf.key || mf.value === undefined || mf.value === null || mf.value === '') return;
      const compound = `${mf.namespace}.${mf.key}`;
      const value = String(mf.value);
      if (!counts.has(compound)) counts.set(compound, new Map());
      const values = counts.get(compound);
      values.set(value, (values.get(value) || 0) + 1);
    });
  }

  const metafields = [];
  counts.forEach((values, compound) => {
    const [namespace, key] = compound.split('.');
    const [value, count] = Array.from(values.entries()).sort((a, b) => b[1] - a[1])[0] || [];
    if (value) metafields.push({ namespace, key, value, type: 'single_line_text_field', source: 'existing-products', confidence: count / Math.max(candidates.length, 1) });
  });

  return { matchedProductCount: candidates.length, metafields };
}

module.exports = {
  healthCheckShopify,
  searchShopifyProducts,
  createShopifyProductFromDraft,
  assignImportLineToProduct,
  restProductToCard,
  numericId,
  shopifyGraphql,
  listRecentlyUsedProductTags,
  getProductMetafieldDefinitions,
  getProfileValuesFromExistingProducts,
};
