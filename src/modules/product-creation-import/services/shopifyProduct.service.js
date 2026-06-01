const { env } = require('../../../config/env');
const { Shop } = require('../../../models');
const { shopifyFetch, shopifyFetchOptional, getAccessTokenForShop, buildInstallUrl, getShopifyStoreUrl } = require('../../../utils/shopify');
const { cleanText, cleanUrl, normaliseTitle, toMoney, normaliseMetafields } = require('../utils/safe');
const { normaliseDraftProduct } = require('./normaliseProduct.service');

const REQUIRED_PRODUCT_IMPORT_SCOPES = ['read_products', 'write_products', 'read_inventory', 'write_inventory'];
const OPTIONAL_NATIVE_SHOPIFY_RECORD_SCOPES = ['read_draft_orders', 'write_draft_orders', 'write_inventory_transfers', 'write_inventory_shipments', 'write_files'];

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

function inventoryItemGid(id = '') {
  const raw = String(id || '').trim();
  if (!raw) return '';
  return raw.startsWith('gid://') ? raw : `gid://shopify/InventoryItem/${raw}`;
}

function scopeSet(scopeString = '') {
  return new Set(String(scopeString || '').split(',').map((scope) => scope.trim()).filter(Boolean));
}

function missingScopes(scopeString = '', required = REQUIRED_PRODUCT_IMPORT_SCOPES) {
  const scopes = scopeSet(scopeString || env.shopifyScopes || '');
  return required.filter((scope) => !scopes.has(scope));
}

function restProductToCard(product = {}, extra = {}) {
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
    images: (product.images || []).map((image) => image.src).filter(Boolean),
    variantId: firstVariant.id ? variantGid(firstVariant.id) : '',
    legacyVariantId: firstVariant.id ? String(firstVariant.id) : '',
    inventoryItemId: firstVariant.inventory_item_id ? inventoryItemGid(firstVariant.inventory_item_id) : '',
    legacyInventoryItemId: firstVariant.inventory_item_id ? String(firstVariant.inventory_item_id) : '',
    sku: firstVariant.sku || '',
    barcode: firstVariant.barcode || '',
    price: firstVariant.price || '',
    compareAtPrice: firstVariant.compare_at_price || '',
    inventoryQuantity: Number(firstVariant.inventory_quantity || 0),
    ...extra,
  };
}

function graphProductToCard(product = {}) {
  const firstVariant = product.variants?.nodes?.[0] || {};
  const productImage = product.featuredMedia?.preview?.image?.url || firstVariant.image?.url || '';
  return {
    id: product.id || '',
    legacyResourceId: String(product.legacyResourceId || numericId(product.id) || ''),
    title: product.title || 'Product',
    handle: product.handle || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    tags: Array.isArray(product.tags) ? product.tags : [],
    image: productImage,
    images: [productImage].filter(Boolean),
    variantId: firstVariant.id || '',
    legacyVariantId: String(firstVariant.legacyResourceId || numericId(firstVariant.id) || ''),
    inventoryItemId: firstVariant.inventoryItem?.id || '',
    legacyInventoryItemId: String(firstVariant.inventoryItem?.legacyResourceId || numericId(firstVariant.inventoryItem?.id) || ''),
    sku: firstVariant.sku || '',
    barcode: firstVariant.barcode || '',
    price: firstVariant.price || '',
    compareAtPrice: firstVariant.compareAtPrice || '',
    inventoryQuantity: Number(firstVariant.inventoryQuantity || 0),
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

async function getStoredScopes(shopDomain) {
  const normalizedShop = getShopifyStoreUrl(shopDomain);
  if (!normalizedShop) return '';
  try {
    const shop = await Shop.findOne({ shopDomain: normalizedShop }).select('scopes').lean();
    return shop?.scopes || env.shopifyScopes || '';
  } catch (_) {
    return env.shopifyScopes || '';
  }
}

async function healthCheckShopify(shopDomain) {
  const normalizedShop = getShopifyStoreUrl(shopDomain);
  const token = await getAccessTokenForShop(normalizedShop);
  const scopes = await getStoredScopes(normalizedShop);
  const missingRequiredScopes = token ? missingScopes(scopes) : REQUIRED_PRODUCT_IMPORT_SCOPES;
  const missingOptionalNativeScopes = token ? missingScopes(scopes, OPTIONAL_NATIVE_SHOPIFY_RECORD_SCOPES) : OPTIONAL_NATIVE_SHOPIFY_RECORD_SCOPES;
  return {
    connected: Boolean(token),
    installUrl: buildInstallUrl(normalizedShop),
    apiVersion: env.shopifyApiVersion,
    requiredScopes: REQUIRED_PRODUCT_IMPORT_SCOPES,
    missingRequiredScopes,
    optionalNativeShopifyRecordScopes: OPTIONAL_NATIVE_SHOPIFY_RECORD_SCOPES,
    missingOptionalNativeScopes,
    message: token
      ? (missingRequiredScopes.length
        ? `Shopify is connected, but this install is missing scopes needed for the full product import flow: ${missingRequiredScopes.join(', ')}. Reinstall the app after updating SHOPIFY_SCOPES.`
        : 'Shopify Admin API token is available for product search, product creation, selected product images, product metafields, optional Shopify Files copy, and inventory cost updates.')
      : 'Reconnect/install the app through Shopify OAuth so product import can search and create products.',
  };
}

function shopifyProductSearchQuery(raw = '') {
  const cleaned = cleanText(raw, 160).replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const compact = cleaned.replace(/[^a-zA-Z0-9_-]/g, '');
  const terms = cleaned.split(/\s+/).filter(Boolean).slice(0, 6).map((term) => term.replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean);
  const parts = [];
  if (compact) {
    parts.push(`sku:${compact}`);
    parts.push(`barcode:${compact}`);
    parts.push(`handle:${compact.toLowerCase()}`);
  }
  terms.forEach((term) => parts.push(`title:*${term}*`));
  if (!parts.length) return cleaned;
  return parts.join(' OR ');
}

async function searchShopifyProductsWithGraphql({ shopDomain, q = '', first = 10 }) {
  const query = `query ProductImportSearch($first: Int!, $query: String!) {
    products(first: $first, query: $query) {
      nodes {
        id
        legacyResourceId
        title
        handle
        vendor
        productType
        tags
        featuredMedia { preview { image { url } } }
        variants(first: 10) {
          nodes {
            id
            legacyResourceId
            sku
            barcode
            price
            compareAtPrice
            inventoryQuantity
            image { url }
            inventoryItem { id legacyResourceId }
          }
        }
      }
    }
  }`;
  const searchQuery = shopifyProductSearchQuery(q);
  const data = await shopifyGraphqlOptional({ shopDomain, query, variables: { first: Math.min(Number(first) || 10, 25), query: searchQuery } });
  return (data?.products?.nodes || []).map(graphProductToCard);
}

async function searchShopifyProductsWithRest({ shopDomain, q = '', first = 10 }) {
  const queryText = cleanText(q, 160).toLowerCase();
  if (!queryText) return [];
  const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=250&fields=id,title,handle,image,images,variants,tags,vendor,product_type`, { shopDomain });
  if (!data) return null;
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


function dedupeProductCards(products = [], first = 10) {
  const byKey = new Map();
  for (const product of products || []) {
    const key = product.id || product.legacyResourceId || product.handle || `${product.title}-${product.sku}`;
    if (!key) continue;
    const score = (item) => (item.image ? 10 : 0) + (item.sku ? 3 : 0) + (item.barcode ? 3 : 0) + (item.inventoryItemId ? 2 : 0);
    const existing = byKey.get(key);
    if (!existing || score(product) > score(existing)) byKey.set(key, product);
  }
  return Array.from(byKey.values()).slice(0, Math.min(Number(first) || 10, 25));
}

async function searchShopifyProducts({ shopDomain, q = '', first = 10 }) {
  const queryText = cleanText(q, 160);
  if (!queryText) return [];
  let products = [];
  try {
    products = await searchShopifyProductsWithGraphql({ shopDomain, q: queryText, first });
  } catch (error) {
    // Some stores/API versions can reject complex search syntax. Fall back to REST filtering.
    products = [];
  }
  if (!products.length) products = await searchShopifyProductsWithRest({ shopDomain, q: queryText, first });
  if (!products) {
    const error = new Error('Shopify product search needs OAuth or a Shopify Admin token.');
    error.status = 412;
    error.requiresOauth = true;
    error.installUrl = buildInstallUrl(shopDomain);
    throw error;
  }
  return dedupeProductCards(products, first);
}


function isValidJsonString(value = '') {
  try { JSON.parse(String(value || '')); return true; } catch (_) { return false; }
}

function plainTextToShopifyRichText(value = '') {
  const lines = String(value || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').split(/\n{2,}/).map((line) => line.trim()).filter(Boolean);
  return JSON.stringify({ type: 'root', children: (lines.length ? lines : ['']).map((line) => ({ type: 'paragraph', children: [{ type: 'text', value: line }] })) });
}

function makeRestMetafield(item = {}) {
  const namespace = cleanText(item.namespace || '', 80);
  const key = cleanText(item.key || '', 80);
  let value = item.value === undefined || item.value === null ? '' : String(item.value);
  const type = cleanText(item.type || 'single_line_text_field', 80) || 'single_line_text_field';
  if (!namespace || !key || value === '') return null;
  if (type === 'rich_text_field' && !isValidJsonString(value)) value = plainTextToShopifyRichText(value);
  if (['number_integer', 'rating'].includes(type)) value = String(Math.round(Number(value) || 0));
  if (type === 'number_decimal') value = String(Number(value) || 0);
  return { namespace, key, type, value };
}

async function updateInventoryItemCost({ shopDomain, inventoryItemId, cost }) {
  const id = numericId(inventoryItemId);
  const unitCost = toMoney(cost);
  if (!id || !unitCost) return null;
  return shopifyFetch(`/admin/api/${env.shopifyApiVersion}/inventory_items/${id}.json`, {
    shopDomain,
    method: 'PUT',
    body: JSON.stringify({ inventory_item: { id: Number(id), cost: unitCost } }),
  });
}

async function createShopifyFilesFromImages({ shopDomain, images = [], title = '' }) {
  const files = (images || []).slice(0, 50).map((image, index) => ({
    originalSource: image.src,
    contentType: 'IMAGE',
    alt: cleanText(image.alt || (index === 0 ? title : `${title} product image ${index + 1}`), 500),
  })).filter((file) => file.originalSource);
  if (!files.length) return { files: [], userErrors: [] };
  const query = `mutation ProductImportFileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        alt
        createdAt
        ... on MediaImage { image { url width height } }
      }
      userErrors { field message code }
    }
  }`;
  const data = await shopifyGraphql({ shopDomain, query, variables: { files } });
  const errors = data?.fileCreate?.userErrors || [];
  if (errors.length) {
    const err = new Error(errors.map((item) => item.message).join('; '));
    err.userErrors = errors;
    throw err;
  }
  return data?.fileCreate || { files: [], userErrors: [] };
}


async function listShopifyCollections({ shopDomain, limit = 250 }) {
  const [customData, smartData] = await Promise.all([
    shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/custom_collections.json?limit=${Math.min(Number(limit) || 250, 250)}&fields=id,title,handle`, { shopDomain }),
    shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/smart_collections.json?limit=${Math.min(Number(limit) || 250, 250)}&fields=id,title,handle`, { shopDomain }),
  ]);
  const custom = (customData?.custom_collections || []).map((collection) => ({ id: String(collection.id), title: collection.title || '', handle: collection.handle || '', type: 'custom' }));
  const smart = (smartData?.smart_collections || []).map((collection) => ({ id: String(collection.id), title: collection.title || '', handle: collection.handle || '', type: 'smart' }));
  return [...custom, ...smart].sort((a, b) => a.title.localeCompare(b.title)).slice(0, Math.min(Number(limit) || 250, 250));
}

async function listProductSeoExamples({ shopDomain, limit = 80 }) {
  const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=${Math.min(Number(limit) || 80, 250)}&fields=id,title,handle,vendor,product_type,tags,metafields_global_title_tag,metafields_global_description_tag`, { shopDomain });
  return (data?.products || []).map((product) => ({
    id: productGid(product.id),
    title: product.title || '',
    handle: product.handle || '',
    vendor: product.vendor || '',
    productType: product.product_type || '',
    tags: String(product.tags || '').split(',').map((x) => x.trim()).filter(Boolean),
    seoTitle: product.metafields_global_title_tag || '',
    seoDescription: product.metafields_global_description_tag || '',
  })).filter((item) => item.title && item.handle).slice(0, Math.min(Number(limit) || 80, 120));
}

function normaliseCollectionSelector(value = '') {
  return cleanText(value || '', 180).toLowerCase().replace(/^gid:\/\/shopify\/Collection\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function attachProductCollectionsOneByOne({ shopDomain, productId, collections = [] }) {
  const numericProductId = numericId(productId);
  const wanted = Array.from(new Set((collections || []).map((item) => cleanText(item, 180)).filter(Boolean)));
  const attached = [];
  const failed = [];
  if (!numericProductId || !wanted.length) return { attached, failed };
  const allCollections = await listShopifyCollections({ shopDomain, limit: 250 });
  for (const selector of wanted) {
    const normalised = normaliseCollectionSelector(selector);
    const found = allCollections.find((collection) => String(collection.id) === selector || normaliseCollectionSelector(collection.handle) === normalised || normaliseCollectionSelector(collection.title) === normalised);
    if (!found) { failed.push({ selector, error: 'Collection not found' }); continue; }
    if (found.type === 'smart') { failed.push({ selector, error: 'Smart collections are rule-based and cannot be manually joined through collects.' }); continue; }
    try {
      const result = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/collects.json`, {
        shopDomain,
        method: 'POST',
        body: JSON.stringify({ collect: { product_id: Number(numericProductId), collection_id: Number(found.id) } }),
      });
      if (result?.collect) attached.push({ ...found, collectId: result.collect.id });
    } catch (error) {
      // Duplicate collect errors are harmless from the user's point of view.
      if (/already exists|taken|duplicate/i.test(error.message || '')) attached.push(found);
      else failed.push({ selector, error: error.message || 'Collection attach failed' });
    }
  }
  return { attached, failed };
}

function listThemeTemplateHints() {
  return ['default', 'gfuel', 'product.gfuel', 'product', 'preorder', 'coming-soon', 'bundle'];
}

async function attachProductImagesOneByOne({ shopDomain, productId, images = [], title = '' }) {
  const numericProductId = numericId(productId);
  const cleanImages = (images || [])
    .map((image, index) => ({
      src: cleanUrl(image.src || image.url || ''),
      alt: cleanText(image.alt || (index === 0 ? title : `${title} product image ${index + 1}`), 500),
    }))
    .filter((image) => image.src)
    .slice(0, 50);
  const attached = [];
  const failed = [];
  if (!numericProductId || !cleanImages.length) return { attached, failed };

  for (const image of cleanImages) {
    try {
      const result = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/products/${numericProductId}/images.json`, {
        shopDomain,
        method: 'POST',
        body: JSON.stringify({ image }),
      });
      if (result?.image?.src) attached.push(result.image);
    } catch (error) {
      failed.push({ src: image.src, error: error.message || 'Image upload failed' });
    }
  }
  return { attached, failed };
}

async function attachProductMetafieldsOneByOne({ shopDomain, productId, metafields = [] }) {
  const numericProductId = numericId(productId);
  const cleanMetafields = (metafields || []).map(makeRestMetafield).filter(Boolean).slice(0, 100);
  const attached = [];
  const failed = [];
  if (!numericProductId || !cleanMetafields.length) return { attached, failed };

  for (const metafield of cleanMetafields) {
    try {
      const result = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/products/${numericProductId}/metafields.json`, {
        shopDomain,
        method: 'POST',
        body: JSON.stringify({ metafield }),
      });
      if (result?.metafield) attached.push(result.metafield);
    } catch (error) {
      failed.push({ namespace: metafield.namespace, key: metafield.key, error: error.message || 'Metafield save failed' });
    }
  }
  return { attached, failed };
}

function createProductErrorMessage(error) {
  const raw = error?.message || 'Shopify product creation failed.';
  if (error?.code === 'SHOPIFY_ACCESS_MISSING') return 'Shopify OAuth/Admin API token is missing for this shop. Reconnect the app, then try creating the draft product again.';
  if (error?.code === 'SHOPIFY_REINSTALL_REQUIRED' || error?.status === 401 || error?.status === 403) return `Shopify refused product creation. Reinstall/reconnect the app with write_products enabled, then try again. ${raw}`.trim();
  return raw;
}

async function createShopifyProductFromDraft({ shopDomain, draft }) {
  const normalised = normaliseDraftProduct(draft || {});
  const tags = Array.isArray(normalised.tags) ? normalised.tags.join(', ') : String(normalised.tags || '');
  const variant = {
    price: toMoney(normalised.price) || '0.00',
    compare_at_price: toMoney(normalised.compareAtPrice) || undefined,
    sku: normalised.sku || undefined,
    barcode: normalised.barcode || undefined,
    weight: normalised.weight ? Number(normalised.weight) : undefined,
    weight_unit: normalised.weight ? (normalised.weightUnit || 'g') : undefined,
    inventory_management: 'shopify',
    option1: 'Default Title',
  };

  const metafields = normaliseMetafields([
    ...(normalised.sourceUrl ? [{ namespace: 'external_import', key: 'source_url', type: 'url', value: normalised.sourceUrl }] : []),
    ...(normalised.cost ? [{ namespace: 'external_import', key: 'price_paid', type: 'single_line_text_field', value: String(normalised.cost) }] : []),
    ...(normalised.weight ? [{ namespace: 'external_import', key: 'imported_weight', type: 'single_line_text_field', value: `${normalised.weight}${normalised.weightUnit || 'g'}` }] : []),
    ...(normalised.quantity ? [{ namespace: 'external_import', key: 'invoice_quantity', type: 'number_integer', value: String(Math.round(Number(normalised.quantity) || 1)) }] : []),
    ...(normalised.metafields || []),
  ]);

  // Create the product first with only fields that should not be optional.
  // Images/metafields/inventory cost are attached afterwards one-by-one so a bad
  // external image URL or a mismatched metafield definition cannot block draft creation.
  const product = {
    title: normalised.title,
    handle: normalised.handle || undefined,
    body_html: normalised.descriptionHtml || '',
    vendor: normalised.vendor || undefined,
    product_type: normalised.productType || undefined,
    status: 'draft',
    tags: tags || undefined,
    template_suffix: normalised.themeTemplate && normalised.themeTemplate !== 'default' ? normalised.themeTemplate.replace(/^product\./i, '') : undefined,
    variants: [variant],
    // Shopify's product SEO fields are stored through the legacy global SEO fields.
    // Set them explicitly so URL imports cannot inherit unrelated SEO from copied profiles.
    metafields_global_title_tag: normalised.seo?.title || normalised.title,
    metafields_global_description_tag: normalised.seo?.description || normalised.title,
  };

  let result;
  try {
    result = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/products.json`, {
      shopDomain,
      method: 'POST',
      body: JSON.stringify({ product }),
    });
  } catch (error) {
    const err = new Error(createProductErrorMessage(error));
    err.status = error.status;
    err.code = error.code;
    throw err;
  }

  const createdProduct = result.product || {};
  let inventoryCostWarning = '';
  let fileCreateWarning = '';
  let imageCreateWarning = '';
  let metafieldCreateWarning = '';
  let createdFiles = [];
  let attachedImages = [];
  let savedMetafields = [];
  let attachedCollections = [];
  let collectionAttachWarning = '';

  if (normalised.images.length) {
    const imageResult = await attachProductImagesOneByOne({ shopDomain, productId: createdProduct.id, images: normalised.images, title: normalised.title });
    attachedImages = imageResult.attached || [];
    if (imageResult.failed?.length) {
      imageCreateWarning = `${imageResult.failed.length} selected image(s) could not be attached to the product. The draft product was still created.`;
    }
  }

  if (metafields.length) {
    const mfResult = await attachProductMetafieldsOneByOne({ shopDomain, productId: createdProduct.id, metafields });
    savedMetafields = mfResult.attached || [];
    if (mfResult.failed?.length) {
      const examples = mfResult.failed.slice(0, 3).map((item) => `${item.namespace}.${item.key}`).join(', ');
      metafieldCreateWarning = `${mfResult.failed.length} metafield(s) could not be saved${examples ? ` (${examples})` : ''}. This usually means the Shopify metafield definition expects another type/value. The draft product was still created.`;
    }
  }

  if (normalised.collections?.length) {
    try {
      const collectionResult = await attachProductCollectionsOneByOne({ shopDomain, productId: createdProduct.id, collections: normalised.collections });
      attachedCollections = collectionResult.attached || [];
      if (collectionResult.failed?.length) {
        const examples = collectionResult.failed.slice(0, 3).map((item) => `${item.selector}: ${item.error}`).join('; ');
        collectionAttachWarning = `${collectionResult.failed.length} collection(s) could not be attached${examples ? ` (${examples})` : ''}. The draft product was still created.`;
      }
    } catch (error) {
      collectionAttachWarning = `Product was created, but collections could not be attached. ${error.message || ''}`.trim();
    }
  }

  if (normalised.cost && createdProduct?.variants?.[0]?.inventory_item_id) {
    try {
      await updateInventoryItemCost({ shopDomain, inventoryItemId: createdProduct.variants[0].inventory_item_id, cost: normalised.cost });
    } catch (error) {
      inventoryCostWarning = `Product was created, but Shopify inventory cost could not be saved. Reinstall with read_inventory/write_inventory and try again. ${error.message || ''}`.trim();
    }
  }

  if (normalised.saveImagesToFiles && normalised.images.length) {
    try {
      const fileResult = await createShopifyFilesFromImages({ shopDomain, images: normalised.images, title: normalised.title });
      createdFiles = fileResult.files || [];
    } catch (error) {
      fileCreateWarning = `Product was created, but selected images could not be copied to Shopify Files. Add write_files scope and reinstall if you want images under Content > Files. ${error.message || ''}`.trim();
    }
  }

  const card = restProductToCard(createdProduct || {}, {
    imageCount: normalised.images.length,
    attachedImageCount: attachedImages.length,
    savedMetafieldCount: savedMetafields.length,
    inventoryCostWarning,
    fileCreateWarning,
    imageCreateWarning,
    metafieldCreateWarning,
    collectionAttachWarning,
    filesCreatedCount: createdFiles.length,
    attachedCollectionCount: attachedCollections.length,
  });
  if (attachedImages[0]?.src) {
    card.image = attachedImages[0].src;
    card.images = attachedImages.map((image) => image.src).filter(Boolean);
  }
  return card;
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

async function listRecentlyUsedProductVendors({ shopDomain, limit = 250 }) {
  const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=${Math.min(Number(limit) || 250, 250)}&fields=id,vendor`, { shopDomain });
  if (!data) return [];
  const counts = new Map();
  (data.products || []).forEach((product) => {
    const vendor = cleanText(product.vendor || '', 120);
    if (vendor) counts.set(vendor, (counts.get(vendor) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([vendor, count]) => ({ vendor, count })).slice(0, 120);
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

async function getProfileValuesFromExistingProducts({ shopDomain, tags = [], vendor = '', productType = '', title = '' }) {
  const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=250&fields=id,title,tags,vendor,product_type`, { shopDomain });
  if (!data) return { matchedProductCount: 0, metafields: [] };
  const wantedTags = new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).toLowerCase()));
  const wantedVendor = String(vendor || '').toLowerCase();
  const wantedType = String(productType || '').toLowerCase();
  const wantedTitleTokens = new Set(normaliseTitle(title).split(/\s+/).filter((word) => word.length > 2 && !['the', 'and', 'with', 'for', 'from', 'product', 'imported'].includes(word)));
  const candidates = (data.products || []).filter((product) => {
    const productTags = String(product.tags || '').split(',').map((tag) => tag.trim().toLowerCase());
    const tagHit = wantedTags.size ? productTags.some((tag) => wantedTags.has(tag)) : false;
    const vendorHit = wantedVendor && String(product.vendor || '').toLowerCase() === wantedVendor;
    const typeHit = wantedType && String(product.product_type || '').toLowerCase() === wantedType;
    const productTitleTokens = new Set(normaliseTitle(product.title).split(/\s+/).filter((word) => word.length > 2));
    const titleOverlap = Array.from(wantedTitleTokens).filter((token) => productTitleTokens.has(token)).length;
    const narrowVendorTitleHit = vendorHit && wantedTitleTokens.size >= 2 && titleOverlap >= Math.min(2, wantedTitleTokens.size);

    // Vendor alone is too broad for profile copying. A G Fuel lunch box should not inherit
    // drink metafields from unrelated tubs just because the vendor matches.
    return tagHit || typeHit || narrowVendorTitleHit;
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
  listRecentlyUsedProductVendors,
  getProductMetafieldDefinitions,
  getProfileValuesFromExistingProducts,
  listShopifyCollections,
  listProductSeoExamples,
  listThemeTemplateHints,
  REQUIRED_PRODUCT_IMPORT_SCOPES,
  OPTIONAL_NATIVE_SHOPIFY_RECORD_SCOPES,
};
