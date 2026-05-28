const { env } = require('../../../config/env');
const { shopifyFetch, shopifyFetchOptional, getAccessTokenForShop, buildInstallUrl } = require('../../../utils/shopify');
const { cleanText, normaliseTitle, toMoney } = require('../utils/safe');
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
    image: product.image?.src || product.images?.[0]?.src || '',
    variantId: firstVariant.id ? variantGid(firstVariant.id) : '',
    legacyVariantId: firstVariant.id ? String(firstVariant.id) : '',
    sku: firstVariant.sku || '',
    barcode: firstVariant.barcode || '',
    price: firstVariant.price || '',
    inventoryQuantity: Number(firstVariant.inventory_quantity || 0),
  };
}

async function healthCheckShopify(shopDomain) {
  const token = await getAccessTokenForShop(shopDomain);
  return {
    connected: Boolean(token),
    installUrl: buildInstallUrl(shopDomain),
    apiVersion: env.shopifyApiVersion,
    requiredScopes: ['read_products', 'write_products'],
    message: token ? 'Shopify Admin API token is available for product search and product creation.' : 'Reconnect/install the app through Shopify OAuth so product import can search and create products.',
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
      const haystack = [product.title, product.handle, product.id, firstVariant.sku, firstVariant.barcode, product.vendor, product.product_type]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(queryText) || normaliseTitle(product.title).includes(normalisedQuery);
    })
    .slice(0, Math.min(Number(first) || 10, 25))
    .map(restProductToCard);
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

  const product = {
    title: normalised.title,
    body_html: normalised.descriptionHtml || '',
    vendor: normalised.vendor || undefined,
    product_type: normalised.productType || undefined,
    status: 'draft',
    tags,
    variants: [variant],
    images: normalised.images.map((image) => ({ src: image.src, alt: image.alt || normalised.title })).slice(0, 12),
    metafields: [
      normalised.sourceUrl ? { namespace: 'external_import', key: 'source_url', type: 'url', value: normalised.sourceUrl } : null,
      normalised.cost ? { namespace: 'external_import', key: 'price_paid', type: 'single_line_text_field', value: String(normalised.cost) } : null,
    ].filter(Boolean),
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

module.exports = { healthCheckShopify, searchShopifyProducts, createShopifyProductFromDraft, assignImportLineToProduct, restProductToCard, numericId };
