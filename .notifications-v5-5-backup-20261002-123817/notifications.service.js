const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { env } = require('../../config/env');
const { EmailProviderSettings } = require('../../models');
const { encryptSecret, decryptSecret } = require('../../utils/crypto');
const { anonymousRef, publicRef, redactText, scrubMeta } = require('./services/privacyVault');
const { cleanEmail, cleanText, clampNumber } = require('../../utils/validation');
const { shopifyFetch } = require('../../utils/shopify');
const { NotificationConfig, RestockSubscription, NotificationEvent, StockObservation } = require('./notifications.models');

const RESTOCK_TOPIC = 'inventory_levels/update';
const PRODUCT_UPDATE_TOPIC = 'products/update';
const FLOW_TRIGGER_HANDLES = { restock: 'elev8-product-restocked', archived: 'elev8-product-archived' };

function publicError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

function emailHash(shopDomain, email) {
  const secret = env.emailCredentialSecret || env.shopifyApiSecret;
  if (!secret || secret.length < 16) throw new Error('EMAIL_CREDENTIAL_SECRET must be configured for notifications.');
  return crypto.createHmac('sha256', secret).update(`${String(shopDomain).toLowerCase()}|${String(email).toLowerCase()}`).digest('hex');
}

function maskEmail(email = '') {
  const [local = '', domain = ''] = String(email).split('@');
  if (!local || !domain) return 'Hidden';
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}

function replaceTokens(value, data = {}) {
  return String(value || '').replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key) => String(data[key] ?? ''));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
}

async function getOrCreateConfig(shopDomain) {
  return NotificationConfig.findOneAndUpdate(
    { shopDomain },
    { $setOnInsert: { shopDomain } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function publicStorefrontConfig(config) {
  const sf = config?.storefront || {};
  return {
    enabled: config?.enabled !== false && config?.restockEnabled !== false,
    inStockLabel: sf.inStockLabel || 'Add to cart',
    inStockBackground: sf.inStockBackground || '#111111',
    inStockTextColor: sf.inStockTextColor || '#ffffff',
    soldOutLabel: sf.soldOutLabel || 'Notify me when available',
    subscribedLabel: sf.subscribedLabel || 'Notification active',
    removeLabel: sf.removeLabel || 'Remove alert',
    modalTitle: sf.modalTitle || 'Get notified when it’s back',
    modalCopy: sf.modalCopy || 'Enter your email and we’ll let you know as soon as this product is available again.',
    style: sf.style || 'outline',
    background: sf.background || '#111111',
    textColor: sf.textColor || '#ffffff',
    outlineColor: sf.outlineColor || '#d7dce1',
    radius: Number(sf.radius ?? 8),
    height: Number(sf.height ?? 56),
    showBellIcon: sf.showBellIcon !== false,
  };
}

async function recordEvent(shopDomain, type, payload = {}) {
  const safe = { ...payload };
  if (safe.detail) safe.detail = redactText(safe.detail);
  if (safe.meta) safe.meta = scrubMeta(safe.meta, shopDomain);
  return NotificationEvent.create({ shopDomain, type, ...safe, occurredAt: new Date() });
}


function flowConnectionDefinitions(config = {}) {
  const lifecycle = config.delivery?.flowLifecycle || {};
  const legacyReady = config.delivery?.syncShopifyTags !== false;
  const builtIns = [
    {
      key: 'legacy-tags',
      label: 'Existing Shopify tag Flow',
      purpose: 'restock',
      kind: 'legacy',
      handle: '',
      enabled: legacyReady,
      connected: legacyReady,
      description: 'Keeps the existing restock_id_* customer tags and lets your current Shopify Flow continue to send.',
    },
    {
      key: 'elev8-restock',
      label: 'ELEV8 · Back in stock',
      purpose: 'restock',
      kind: 'trigger',
      handle: FLOW_TRIGGER_HANDLES.restock,
      enabled: Boolean(lifecycle.restock?.hasEnabledFlow),
      connected: Boolean(lifecycle.restock?.hasEnabledFlow),
      lastChangedAt: lifecycle.restock?.timestamp || null,
      definitionId: lifecycle.restock?.definitionId || '',
      description: 'ELEV8 fires a Shopify Flow trigger for each waiting customer when stock returns.',
    },
    {
      key: 'elev8-archived',
      label: 'ELEV8 · Archived product demand',
      purpose: 'archived',
      kind: 'trigger',
      handle: FLOW_TRIGGER_HANDLES.archived,
      enabled: Boolean(lifecycle.archived?.hasEnabledFlow),
      connected: Boolean(lifecycle.archived?.hasEnabledFlow),
      lastChangedAt: lifecycle.archived?.timestamp || null,
      definitionId: lifecycle.archived?.definitionId || '',
      description: 'Optional Flow for customers who were waiting when a product is archived.',
    },
  ];
  const known = new Set(['restock','archived']);
  Object.entries(lifecycle).forEach(([key, value]) => {
    if (known.has(key) || !value) return;
    builtIns.push({
      key: `shopify-${key}`,
      label: value.definitionId || `Shopify Flow ${key}`,
      purpose: 'other',
      kind: 'discovered',
      handle: '',
      enabled: Boolean(value.hasEnabledFlow),
      connected: Boolean(value.hasEnabledFlow),
      lastChangedAt: value.timestamp || null,
      definitionId: value.definitionId || '',
      description: 'A Shopify Flow trigger lifecycle callback discovered by ELEV8.',
    });
  });
  return builtIns;
}

function classifyFlowDefinition(definitionId = '') {
  const value = String(definitionId || '').toLowerCase();
  if (/archiv|discontinu|retir/.test(value)) return 'archived';
  if (/restock|back.?in.?stock|stock/.test(value)) return 'restock';
  return value.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'unknown';
}

async function recordFlowLifecycle({ shopDomain, definitionId, hasEnabledFlow, timestamp }) {
  const config = await getOrCreateConfig(shopDomain);
  const key = classifyFlowDefinition(definitionId);
  const incoming = timestamp ? new Date(timestamp) : new Date();
  const existing = config.delivery?.flowLifecycle?.[key];
  if (existing?.timestamp && new Date(existing.timestamp) > incoming) {
    return { ok: true, ignored: 'older_callback', key };
  }
  const next = { ...(config.delivery?.flowLifecycle || {}) };
  next[key] = {
    definitionId: cleanText(definitionId, 200),
    hasEnabledFlow: Boolean(hasEnabledFlow),
    timestamp: incoming.toISOString(),
  };
  config.delivery.flowLifecycle = next;
  config.markModified('delivery.flowLifecycle');
  await config.save();
  await recordEvent(shopDomain, 'flow_connection_changed', { detail: `${definitionId}: ${hasEnabledFlow ? 'enabled' : 'disabled'}`, meta: { key, definitionId, hasEnabledFlow: Boolean(hasEnabledFlow) } });
  return { ok: true, key, enabled: Boolean(hasEnabledFlow) };
}

async function listFlowConnections(shopDomain) {
  const config = await getOrCreateConfig(shopDomain);
  return {
    selectedRestock: config.delivery?.flowConnectionKey || 'legacy-tags',
    selectedArchived: config.delivery?.archivedFlowConnectionKey || 'none',
    connections: flowConnectionDefinitions(config),
  };
}

async function sendFlowTrigger(shopDomain, handle, payload = {}) {
  if (!handle) throw new Error('Missing Shopify Flow trigger handle.');
  const data = await shopifyGraphql(shopDomain, `mutation Elev8FlowTrigger($handle:String!,$payload:JSON!){flowTriggerReceive(handle:$handle,payload:$payload){userErrors{field message}}}`, { handle, payload });
  const errors = data?.flowTriggerReceive?.userErrors || [];
  if (errors.length) throw new Error(errors.map((x) => x.message).join('; '));
  return { ok: true };
}

async function recordStockObservation(shopDomain, resolved = {}, inventoryItemId = '') {
  if (!resolved.variantId) return { observation: null, becameAvailable: false, becameUnavailable: false };
  const now = new Date();
  const previous = await StockObservation.findOne({ shopDomain, variantId: String(resolved.variantId) }).lean();
  const quantity = Number(resolved.inventoryQuantity ?? resolved.quantity ?? 0);
  const inStock = Boolean(resolved.availableForSale) && quantity > 0;
  const becameAvailable = previous ? !previous.inStock && inStock : inStock;
  const becameUnavailable = previous ? previous.inStock && !inStock : false;
  const update = {
    inventoryItemId: String(inventoryItemId || previous?.inventoryItemId || ''),
    productId: String(resolved.productId || previous?.productId || ''),
    productTitle: cleanText(resolved.productTitle || previous?.productTitle || '', 240),
    variantTitle: cleanText(resolved.title || resolved.variantTitle || previous?.variantTitle || '', 240),
    productHandle: cleanText(resolved.productHandle || previous?.productHandle || '', 240),
    productImage: cleanText(resolved.productImage || previous?.productImage || '', 1200),
    productStatus: String(resolved.productStatus || previous?.productStatus || '').toUpperCase(),
    publishedAt: resolved.publishedAt || previous?.publishedAt || null,
    quantity,
    inStock,
    lastObservedAt: now,
  };
  if (!previous) update.firstObservedAt = now;
  if (inStock) {
    update.lastInStockAt = now;
    update.outOfStockSince = null;
    update.lastPositiveQuantity = Math.max(0, quantity);
  } else if (becameUnavailable || !previous) {
    update.outOfStockSince = previous?.outOfStockSince || now;
  }
  if (String(update.productStatus).toUpperCase() === 'ARCHIVED') update.archivedAt = previous?.archivedAt || now;
  const observation = await StockObservation.findOneAndUpdate(
    { shopDomain, variantId: String(resolved.variantId) },
    { $set: update, $setOnInsert: { shopDomain, variantId: String(resolved.variantId) } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return { observation, becameAvailable, becameUnavailable };
}

async function getSubscriptionStatus({ shopDomain, email, variantId }) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail || !variantId) return { subscribed: false };
  const key = emailHash(shopDomain, normalizedEmail);
  const row = await RestockSubscription.findOne({ shopDomain, emailHash: key, variantId: String(variantId) }).lean();
  return { subscribed: row?.status === 'active' || row?.status === 'sending', status: row?.status || 'none' };
}

async function resolveSubscriptionVariant(shopDomain, variantId) {
  const numericId = String(variantId || '').replace(/[^0-9]/g, '');
  if (!numericId) throw publicError('Missing variant id.', 400);
  const gid = `gid://shopify/ProductVariant/${numericId}`;
  const data = await shopifyGraphql(shopDomain, `query NotificationVariant($id: ID!) {
    productVariant(id: $id) {
      id
      legacyResourceId
      title
      availableForSale
      product { id legacyResourceId title handle featuredImage { url } }
    }
    shop { primaryDomain { url } }
  }`, { id: gid });
  const variant = data?.productVariant;
  if (!variant) throw publicError('This product variant could not be found.', 404);
  const primary = String(data?.shop?.primaryDomain?.url || `https://${shopDomain}`).replace(/\/$/, '');
  const handle = String(variant.product?.handle || '');
  return {
    variantId: String(variant.legacyResourceId || numericId),
    variantTitle: variant.title || '',
    availableForSale: Boolean(variant.availableForSale),
    inventoryQuantity: Number(variant.inventoryQuantity || 0),
    productId: String(variant.product?.legacyResourceId || String(variant.product?.id || '').split('/').pop()),
    productTitle: variant.product?.title || '',
    productHandle: handle,
    productUrl: handle ? `${primary}/products/${encodeURIComponent(handle)}?variant=${encodeURIComponent(String(variant.legacyResourceId || numericId))}` : primary,
    productImage: variant.product?.featuredImage?.url || '',
  };
}

function safeRestockTag(value = '') {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
}

function legacyProductPath(resolved = {}) {
  if (resolved.productHandle) return `/products/${resolved.productHandle}`;
  try { const u = new URL(String(resolved.productUrl || '')); return u.pathname || ''; } catch (_) { return String(resolved.productUrl || '').replace(/^https?:\/\/[^/]+/i, ''); }
}
function legacyNotificationLatest(resolved = {}) { return legacyProductPath(resolved).replace(/^\//, '').replace(/[\/\-]/g, '_').toLowerCase(); }
function restockTagsFor(resolved = {}) {
  const path = legacyProductPath(resolved);
  return [
    'restock-notif',
    resolved.productTitle ? `restock_${safeRestockTag(resolved.productTitle)}` : '',
    resolved.variantId ? `restock_id_${String(resolved.variantId).replace(/[^0-9]/g, '')}` : '',
    path ? `restock_url_${safeRestockTag(path)}` : '',
  ].filter(Boolean);
}

function flowAdminFallback(shopDomain) {
  const handle = String(shopDomain || '').replace(/\.myshopify\.com$/i, '');
  return handle ? `https://admin.shopify.com/store/${encodeURIComponent(handle)}/apps/flow` : 'https://admin.shopify.com';
}

async function findShopifyCustomerByEmail(shopDomain, email) {
  const escaped = String(email || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const data = await shopifyGraphql(shopDomain, `query NotificationCustomerByEmail($query: String!) {
    customers(first: 1, query: $query) { nodes { id legacyResourceId email tags } }
  }`, { query: `email:"${escaped}"` });
  return data?.customers?.nodes?.[0] || null;
}

async function syncShopifyRestockTags({ shopDomain, email, resolved, action = 'add' }) {
  const customer = await findShopifyCustomerByEmail(shopDomain, email);
  const wanted = restockTagsFor(resolved);
  if (!customer && action === 'remove') return { ok: true, skipped: 'customer_missing' };
  if (!customer && action === 'add') {
    const created = await shopifyGraphql(shopDomain, `mutation NotificationCustomerCreate($input: CustomerInput!) {
      customerCreate(input: $input) { customer { id email tags } userErrors { field message } }
    }`, { input: { email, tags: wanted, metafields: resolved.productUrl ? [{ namespace: 'custom', key: 'notification_latest', value: legacyNotificationLatest(resolved), type: 'single_line_text_field' }] : [] } });
    const errors = created?.customerCreate?.userErrors || [];
    if (errors.length) throw new Error(errors.map((x) => x.message).join('; '));
    return { ok: true, created: true };
  }
  const current = Array.isArray(customer.tags) ? customer.tags : [];
  let tags;
  if (action === 'remove') {
    const removeSet = new Set(wanted.filter((t) => t !== 'restock-notif').map((t) => t.toLowerCase()));
    tags = current.filter((tag) => !removeSet.has(String(tag).toLowerCase()));
    const hasOtherRestockIds = tags.some((tag) => /^restock_id_\d+$/i.test(String(tag)));
    if (!hasOtherRestockIds) tags = tags.filter((tag) => String(tag).toLowerCase() !== 'restock-notif');
  } else {
    const seen = new Map(current.map((tag) => [String(tag).toLowerCase(), tag]));
    wanted.forEach((tag) => { if (!seen.has(tag.toLowerCase())) current.push(tag); });
    tags = current;
  }
  const input = { id: customer.id, tags };
  if (action === 'add' && resolved.productUrl) input.metafields = [{ namespace: 'custom', key: 'notification_latest', value: legacyNotificationLatest(resolved), type: 'single_line_text_field' }];
  const updated = await shopifyGraphql(shopDomain, `mutation NotificationCustomerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) { customer { id email tags } userErrors { field message } }
  }`, { input });
  const errors = updated?.customerUpdate?.userErrors || [];
  if (errors.length) throw new Error(errors.map((x) => x.message).join('; '));
  return { ok: true, created: false };
}

async function subscribeRestock({ shopDomain, email, variantId, source = 'storefront' }) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail) throw publicError('Please enter a valid email address.', 400);
  if (!variantId) throw publicError('Missing variant id.', 400);
  const config = await getOrCreateConfig(shopDomain);
  if (config.enabled === false || config.restockEnabled === false) throw publicError('Back-in-stock notifications are not enabled for this store.', 409);
  const resolved = await resolveSubscriptionVariant(shopDomain, variantId);
  if (resolved.availableForSale) throw publicError('This item is already back in stock. Refresh the page to add it to your cart.', 409);
  const key = emailHash(shopDomain, normalizedEmail);
  const now = new Date();
  const row = await RestockSubscription.findOneAndUpdate(
    { shopDomain, emailHash: key, variantId: resolved.variantId },
    { $set: { emailEncrypted: encryptSecret(normalizedEmail), productId: cleanText(resolved.productId,80), productTitle: cleanText(resolved.productTitle,240), productHandle: cleanText(resolved.productHandle,240), productUrl: cleanText(resolved.productUrl,800), productImage: cleanText(resolved.productImage,1200), variantTitle: cleanText(resolved.variantTitle,240), source: cleanText(source,60)||'storefront', status:'active', subscribedAt:now, sentAt:null, unsubscribedAt:null, lastError:'' }, $setOnInsert: { shopDomain, emailHash:key, variantId:resolved.variantId, sendAttempts:0 } },
    { upsert:true, new:true, setDefaultsOnInsert:true }
  );
  let shopifySynced = false;
  if (config.delivery?.syncShopifyTags !== false) {
    try {
      await syncShopifyRestockTags({ shopDomain, email: normalizedEmail, resolved, action: 'add' });
      shopifySynced = true;
    }
    catch (error) {
      await RestockSubscription.updateOne({ _id: row._id }, { $set: { lastError: `Shopify tag sync: ${String(error.message || error).slice(0,420)}` } });
      await recordEvent(shopDomain,'restock_tag_sync_failed',{variantId:row.variantId,productId:row.productId,productTitle:row.productTitle,emailHash:key,detail:String(error.message||error).slice(0,500)});
      if ((config.delivery?.mode || 'flow') === 'flow') throw publicError('Your alert was saved, but Shopify Flow tag sync failed. Check the write_customers permission in Notifications Center.', 502);
    }
  }
  await recordEvent(shopDomain, 'restock_subscribed', { variantId: row.variantId, productId: row.productId, productTitle: row.productTitle, emailHash: key, meta: { shopifySynced } });
  return { success:true, subscribed:true, status:row.status, deliveryMode:config.delivery?.mode || 'flow', shopifySynced };
}

async function unsubscribeRestock({ shopDomain, email, variantId }) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail || !variantId) return { success:true, subscribed:false, status:'none' };
  const key = emailHash(shopDomain, normalizedEmail);
  const row = await RestockSubscription.findOne({ shopDomain, emailHash:key, variantId:String(variantId) });
  const config = await getOrCreateConfig(shopDomain);
  if (row && config.delivery?.syncShopifyTags !== false) {
    const resolved = { variantId:row.variantId, productId:row.productId, productTitle:row.productTitle, productHandle:row.productHandle, productUrl:row.productUrl, productImage:row.productImage, variantTitle:row.variantTitle };
    try { await syncShopifyRestockTags({ shopDomain, email:normalizedEmail, resolved, action:'remove' }); }
    catch (error) { await recordEvent(shopDomain,'restock_tag_sync_failed',{variantId:row.variantId,productId:row.productId,productTitle:row.productTitle,emailHash:key,detail:String(error.message||error).slice(0,500),meta:{action:'remove'}}); }
  }
  const updated = await RestockSubscription.findOneAndUpdate({ shopDomain, emailHash:key, variantId:String(variantId) }, { $set:{ status:'unsubscribed', unsubscribedAt:new Date(), lastError:'' } }, { new:true });
  if (updated) await recordEvent(shopDomain,'restock_unsubscribed',{variantId:updated.variantId,productId:updated.productId,productTitle:updated.productTitle,emailHash:key});
  return { success:true, subscribed:false, status:updated?'unsubscribed':'none' };
}

function createTransporter(settings) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: Number(settings.smtpPort || 587),
    secure: settings.secureMode === 'ssl' || Number(settings.smtpPort) === 465,
    requireTLS: settings.secureMode === 'starttls',
    auth: { user: settings.smtpUser, pass: decryptSecret(settings.smtpPassEncrypted) },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

async function activeEmailSettings(shopDomain) {
  const settings = await EmailProviderSettings.findOne({ shopDomain }).lean();
  if (!settings?.enabled || !settings?.smtpPassEncrypted || !settings?.fromEmail) {
    const error = new Error('Email provider is not configured for this shop.');
    error.code = 'EMAIL_NOT_READY';
    throw error;
  }
  return settings;
}

function absoluteProductUrl(shopDomain, productUrl = '') {
  const raw = String(productUrl || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `https://${shopDomain}${raw}`;
  return raw ? `https://${shopDomain}/${raw.replace(/^\/+/, '')}` : `https://${shopDomain}`;
}

function validHex(value, fallback) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback; }
function renderRestockEmailHtml(config, tokens = {}) {
  const e = config?.email || {};
  const subject = replaceTokens(e.subject || '{{ product_title }} is back in stock', tokens);
  const preheader = replaceTokens(e.preheader || '', tokens);
  const eyebrow = replaceTokens(e.eyebrow || 'Back in stock', tokens);
  const heading = replaceTokens(e.heading || 'It’s back.', tokens);
  const body = replaceTokens(e.body || '{{ product_title }} is available again.', tokens);
  const buttonLabel = replaceTokens(e.buttonLabel || 'Shop now', tokens);
  const footer = replaceTokens(e.footer || '', tokens);
  const productUrl = tokens.product_url || '#';
  const productImage = tokens.product_image || '';
  const variantTitle = tokens.variant_title || '';
  const align = e.align === 'left' ? 'left' : 'center';
  const width = clampNumber(e.contentWidth,420,760,620);
  const background = validHex(e.backgroundColor,'#f5f7f8');
  const card = validHex(e.cardColor,'#ffffff');
  const accent = validHex(e.accentColor,'#17657a');
  const textColor = validHex(e.textColor,'#111827');
  const muted = validHex(e.mutedTextColor,'#667085');
  const buttonBg = validHex(e.buttonBackground,'#111827');
  const buttonText = validHex(e.buttonTextColor,'#ffffff');
  const buttonRadius = clampNumber(e.buttonRadius,0,30,9);
  const cardRadius = clampNumber(e.cardRadius,0,36,18);
  const imageRadius = clampNumber(e.imageRadius,0,36,14);
  const logo = e.logoUrl ? `<img src="${escapeHtml(e.logoUrl)}" alt="" style="display:block;max-width:180px;max-height:60px;width:auto;height:auto;margin:${align==='center'?'0 auto 24px':'0 0 24px'}">` : '';
  const image = e.showProductImage !== false && productImage ? `<img src="${escapeHtml(productImage)}" alt="" style="display:block;width:100%;max-width:360px;height:auto;margin:${align==='center'?'0 auto 24px':'0 0 24px'};border-radius:${imageRadius}px">` : '';
  const variant = e.showVariant !== false && variantTitle ? `<p style="margin:8px 0 0;color:${muted};font-size:13px">${escapeHtml(variantTitle)}</p>` : '';
  const hiddenPreheader = preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:${background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${textColor}">${hiddenPreheader}<div style="max-width:${width}px;margin:0 auto;padding:34px 18px"><div style="background:${card};border:1px solid #e5e7eb;border-radius:${cardRadius}px;padding:34px;text-align:${align}">${logo}${image}<p style="margin:0 0 8px;color:${accent};font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(eyebrow)}</p><h1 style="margin:0 0 10px;font-size:30px;line-height:1.15;letter-spacing:-.03em;color:${textColor}">${escapeHtml(heading)}</h1>${variant}<p style="margin:16px ${align==='center'?'auto':'0'} 24px;max-width:500px;color:${muted};line-height:1.65;font-size:15px">${escapeHtml(body)}</p><a href="${escapeHtml(productUrl)}" style="display:inline-block;background:${buttonBg};color:${buttonText};text-decoration:none;border-radius:${buttonRadius}px;padding:14px 24px;font-weight:800">${escapeHtml(buttonLabel)}</a>${footer?`<p style="margin:28px ${align==='center'?'auto':'0'} 0;max-width:520px;color:${muted};font-size:12px;line-height:1.55">${escapeHtml(footer)}</p>`:''}</div></div></body></html>`;
  return { subject, html, text:`${heading}\n\n${body}\n\n${productUrl}` };
}


function renderArchivedEmailHtml(config, tokens = {}) {
  return renderRestockEmailHtml({ ...config, email: config?.archivedEmail || {} }, tokens);
}

async function sendRestockEmail({ shopDomain, subscription, config }) {
  const emailSettings = await activeEmailSettings(shopDomain);
  const recipient = decryptSecret(subscription.emailEncrypted);
  const productUrl = absoluteProductUrl(shopDomain, subscription.productUrl || (subscription.productHandle ? `/products/${subscription.productHandle}` : ''));
  const tokens = { product_title:subscription.productTitle||'Your item', variant_title:subscription.variantTitle||'', product_url:productUrl, product_image:subscription.productImage||'' };
  const rendered = renderRestockEmailHtml(config,tokens);
  const transporter = createTransporter(emailSettings);
  await transporter.sendMail({ from:emailSettings.fromName?`"${String(emailSettings.fromName).replace(/"/g,'')}" <${emailSettings.fromEmail}>`:emailSettings.fromEmail, to:recipient, replyTo:emailSettings.replyToEmail||emailSettings.fromEmail, subject:rendered.subject, html:rendered.html, text:rendered.text });
}

async function shopifyGraphql(shopDomain, query, variables = {}) {
  const data = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/graphql.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ query, variables }),
  });
  if (Array.isArray(data.errors) && data.errors.length) throw new Error(data.errors.map((x) => x.message).join('; '));
  return data.data || {};
}

async function resolveInventoryVariant(shopDomain, inventoryItemId) {
  const gid = String(inventoryItemId).startsWith('gid://') ? String(inventoryItemId) : `gid://shopify/InventoryItem/${inventoryItemId}`;
  const data = await shopifyGraphql(shopDomain, `query NotificationInventoryItem($id: ID!) { inventoryItem(id: $id) { id variants(first: 1) { nodes { id legacyResourceId title availableForSale inventoryQuantity product { id legacyResourceId title handle status publishedAt featuredImage { url } } } } } }`, { id: gid });
  const variant = data?.inventoryItem?.variants?.nodes?.[0];
  if (!variant) return null;
  return {
    variantId: String(variant.legacyResourceId || String(variant.id || '').split('/').pop()),
    title: variant.title || '',
    availableForSale: Boolean(variant.availableForSale),
    productId: String(variant.product?.legacyResourceId || String(variant.product?.id || '').split('/').pop()),
    productTitle: variant.product?.title || '',
    productHandle: variant.product?.handle || '',
    productImage: variant.product?.featuredImage?.url || '',
    productStatus: variant.product?.status || '',
    publishedAt: variant.product?.publishedAt || null,
  };
}


async function listCustomersWaitingForVariant(shopDomain, variantId, maxCustomers = 1000) {
  const tag = `restock_id_${String(variantId || '').replace(/[^0-9]/g, '')}`;
  if (!/\d+$/.test(tag)) return [];
  const rows = []; let after = null; let pages = 0;
  while (rows.length < maxCustomers && pages < 20) {
    const data = await shopifyGraphql(shopDomain, `query NotificationVariantCustomers($first:Int!,$after:String,$query:String!){customers(first:$first,after:$after,query:$query){pageInfo{hasNextPage endCursor}nodes{id legacyResourceId email tags}}}`, { first: Math.min(100, maxCustomers - rows.length), after, query: `tag:${tag}` });
    const conn = data?.customers; rows.push(...(conn?.nodes || [])); pages += 1;
    if (!conn?.pageInfo?.hasNextPage) break; after = conn.pageInfo.endCursor;
  }
  return rows;
}

async function dispatchConnectedFlow({ shopDomain, resolved, config, purpose = 'restock', eventKey = '' }) {
  const selected = purpose === 'archived' ? (config.delivery?.archivedFlowConnectionKey || 'none') : (config.delivery?.flowConnectionKey || 'legacy-tags');
  if (selected === 'none') return { skipped: 'no_connection' };
  if (selected === 'legacy-tags') return { delegated: 'legacy_tag_flow' };
  const connection = flowConnectionDefinitions(config).find((x) => x.key === selected);
  if (!connection?.connected || !connection.handle) return { skipped: 'flow_not_enabled', connection: selected };
  const customers = await listCustomersWaitingForVariant(shopDomain, resolved.variantId);
  const productUrl = resolved.productUrl || (resolved.productHandle ? `https://${shopDomain}/products/${resolved.productHandle}?variant=${resolved.variantId}` : `https://${shopDomain}`);
  const rendered = purpose === 'archived'
    ? renderArchivedEmailHtml(config, { product_title: resolved.productTitle || 'Product', variant_title: resolved.variantTitle || resolved.title || '', product_url: productUrl, product_image: resolved.productImage || '' })
    : renderRestockEmailHtml(config, { product_title: resolved.productTitle || 'Product', variant_title: resolved.variantTitle || resolved.title || '', product_url: productUrl, product_image: resolved.productImage || '' });
  let triggered = 0; let failed = 0;
  for (const customer of customers) {
    const customerId = String(customer.legacyResourceId || String(customer.id || '').split('/').pop()).replace(/[^0-9]/g, '');
    if (!customerId) continue;
    const customerRef = anonymousRef(shopDomain, 'customer', customerId);
    const dedupeRef = anonymousRef(shopDomain, 'flow-dedupe', `${eventKey || purpose}:${customerId}:${resolved.variantId}`);
    const duplicate = await NotificationEvent.findOne({ shopDomain, type: 'flow_triggered', 'meta.dedupeRef': dedupeRef }).select('_id').lean();
    if (duplicate) continue;
    try {
      await sendFlowTrigger(shopDomain, connection.handle, {
        customer_id: Number(customerId),
        product_id: Number(String(resolved.productId || '').replace(/[^0-9]/g, '')),
        'Variant ID': String(resolved.variantId || ''),
        'Product title': String(resolved.productTitle || ''),
        'Variant title': String(resolved.variantTitle || resolved.title || ''),
        'Product URL': String(productUrl),
        'Product image': String(resolved.productImage || productUrl),
        'Template': purpose,
        'Email subject': String(rendered.subject || ''),
        'Email HTML': String(rendered.html || '').slice(0, 42000),
      });
      await recordEvent(shopDomain, 'flow_triggered', { variantId: String(resolved.variantId || ''), productId: String(resolved.productId || ''), productTitle: resolved.productTitle || '', detail: connection.label, meta: { dedupeRef, purpose, customerRef, connectionKey: connection.key } });
      triggered += 1;
    } catch (error) {
      await recordEvent(shopDomain, 'flow_trigger_failed', { variantId: String(resolved.variantId || ''), productId: String(resolved.productId || ''), productTitle: resolved.productTitle || '', detail: String(error.message || error).slice(0, 500), meta: { purpose, customerRef, connectionKey: connection.key } });
      failed += 1;
    }
  }
  return { triggered, failed, connection: connection.key, customers: customers.length };
}

async function processInventoryLevelUpdate({ shopDomain, inventoryItemId, available, webhookId = '' }) {
  const config = await getOrCreateConfig(shopDomain);
  config.webhook.lastReceivedAt = new Date();
  config.webhook.lastInventoryItemId = String(inventoryItemId || '');
  await config.save();
  const resolved = await resolveInventoryVariant(shopDomain, inventoryItemId);
  if (!resolved?.variantId) return { skipped: 'variant_not_found' };
  const stock = await recordStockObservation(shopDomain, resolved, inventoryItemId);
  if (config.enabled === false || config.restockEnabled === false) return { skipped: 'disabled', telemetry: true };
  const totalAvailable = Number(resolved.inventoryQuantity || 0);
  if (!resolved.availableForSale || totalAvailable < Number(config.sendThreshold || 1)) return { skipped: 'not_available_for_sale', variantId: resolved.variantId };
  if (!stock.becameAvailable) return { skipped: 'already_in_stock', variantId: resolved.variantId };
  if ((config.delivery?.mode || 'flow') === 'flow') {
    const result = await dispatchConnectedFlow({ shopDomain, resolved, config, purpose: 'restock', eventKey: webhookId || String(stock.observation?.lastInStockAt || Date.now()) });
    await recordEvent(shopDomain, 'restock_flow_inventory_ready', { variantId: resolved.variantId, productId: resolved.productId, productTitle: resolved.productTitle, meta: { webhookId, available: totalAvailable, ...result } });
    return { delegated: 'shopify_flow', variantId: resolved.variantId, ...result };
  }

  const candidates = await RestockSubscription.find({ shopDomain, variantId: resolved.variantId, status: 'active', sendAttempts: { $lt: 3 } }).sort({ subscribedAt: 1 }).limit(1000);
  let sent = 0; let failed = 0; const workers = Math.min(5, Math.max(1, candidates.length)); let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const item = candidates[cursor++];
      const claimed = await RestockSubscription.findOneAndUpdate({ _id: item._id, status: 'active' }, { $set: { status: 'sending', lastAttemptAt: new Date(), lastWebhookId: webhookId }, $inc: { sendAttempts: 1 } }, { new: true });
      if (!claimed) continue;
      if (!claimed.productTitle && resolved.productTitle) claimed.productTitle = resolved.productTitle;
      if (!claimed.productId && resolved.productId) claimed.productId = resolved.productId;
      if (!claimed.productHandle && resolved.productHandle) claimed.productHandle = resolved.productHandle;
      if (!claimed.productImage && resolved.productImage) claimed.productImage = resolved.productImage;
      if (!claimed.variantTitle && resolved.title) claimed.variantTitle = resolved.title;
      try {
        await sendRestockEmail({ shopDomain, subscription: claimed, config });
        const nextStatus = config.oneShot === false ? 'active' : 'sent';
        await RestockSubscription.updateOne({ _id: claimed._id }, { $set: { status: nextStatus, sentAt: new Date(), lastError: '', productTitle: claimed.productTitle, productId: claimed.productId, productHandle: claimed.productHandle, productImage: claimed.productImage, variantTitle: claimed.variantTitle } });
        await recordEvent(shopDomain, 'restock_sent', { variantId: claimed.variantId, productId: claimed.productId, productTitle: claimed.productTitle, emailHash: claimed.emailHash, meta: { webhookId } }); sent += 1;
      } catch (error) {
        await RestockSubscription.updateOne({ _id: claimed._id }, { $set: { status: 'active', lastError: String(error.message || error).slice(0, 500) } });
        await recordEvent(shopDomain, 'restock_failed', { variantId: claimed.variantId, productId: claimed.productId, productTitle: claimed.productTitle, emailHash: claimed.emailHash, detail: String(error.message || error).slice(0, 500), meta: { webhookId } }); failed += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { sent, failed, variantId: resolved.variantId };
}


async function getProductWithVariants(shopDomain, productId) {
  const numeric = String(productId || '').replace(/[^0-9]/g, '');
  if (!numeric) return null;
  const data = await shopifyGraphql(shopDomain, `query NotificationProductState($id:ID!){product(id:$id){id legacyResourceId title handle status publishedAt featuredImage{url} variants(first:100){nodes{id legacyResourceId title availableForSale inventoryQuantity}}}}`, { id: `gid://shopify/Product/${numeric}` });
  const p = data?.product; if (!p) return null;
  return {
    productId: String(p.legacyResourceId || numeric), productTitle: p.title || '', productHandle: p.handle || '', productImage: p.featuredImage?.url || '', productStatus: String(p.status || '').toUpperCase(), publishedAt: p.publishedAt || null,
    variants: (p.variants?.nodes || []).map((v) => ({ variantId: String(v.legacyResourceId || String(v.id || '').split('/').pop()), variantTitle: v.title || '', title: v.title || '', availableForSale: Boolean(v.availableForSale), inventoryQuantity: Number(v.inventoryQuantity || 0), productId: String(p.legacyResourceId || numeric), productTitle: p.title || '', productHandle: p.handle || '', productImage: p.featuredImage?.url || '', productStatus: String(p.status || '').toUpperCase(), publishedAt: p.publishedAt || null, productUrl: p.handle ? `https://${shopDomain}/products/${p.handle}?variant=${String(v.legacyResourceId || '').replace(/[^0-9]/g, '')}` : '' })),
  };
}

async function processProductUpdate({ shopDomain, productId, status = '', webhookId = '' }) {
  const config = await getOrCreateConfig(shopDomain);
  config.webhook.lastProductUpdateAt = new Date(); await config.save();
  const product = await getProductWithVariants(shopDomain, productId);
  if (!product) return { skipped: 'product_not_found' };
  const productStatus = String(product.productStatus || status || '').toUpperCase();
  let waiting = 0; const archiveActions = [];
  for (const variant of product.variants) {
    await recordStockObservation(shopDomain, { ...variant, productStatus }, '');
    if (productStatus === 'ARCHIVED') {
      const customers = await listCustomersWaitingForVariant(shopDomain, variant.variantId);
      if (!customers.length) continue;
      waiting += customers.length;
      const existing = await NotificationEvent.findOne({ shopDomain, type: 'product_archived_with_demand', variantId: variant.variantId, 'meta.productStatus': 'ARCHIVED' }).select('_id').lean();
      if (!existing) await recordEvent(shopDomain, 'product_archived_with_demand', { variantId: variant.variantId, productId: product.productId, productTitle: product.productTitle, detail: `${customers.length} customer${customers.length === 1 ? '' : 's'} waiting`, meta: { webhookId, productStatus: 'ARCHIVED', waiting: customers.length } });
      if (config.archiveNotifications?.enabled !== false && config.archiveNotifications?.autoSend === true) {
        archiveActions.push(await dispatchConnectedFlow({ shopDomain, resolved: variant, config, purpose: 'archived', eventKey: webhookId || `archive:${product.productId}` }));
      }
    }
  }
  return { productId: product.productId, status: productStatus, variants: product.variants.length, waiting, archiveActions };
}

async function dispatchArchivedDemand(shopDomain, variantId) {
  const config = await getOrCreateConfig(shopDomain);
  const resolved = (await resolveVariantsBulk(shopDomain, [variantId])).get(String(variantId).replace(/[^0-9]/g, ''));
  if (!resolved) throw publicError('The archived product variant could not be found in Shopify.', 404);
  if (String(resolved.productStatus || '').toUpperCase() !== 'ARCHIVED') throw publicError('This product is not archived.', 409);
  const result = await dispatchConnectedFlow({ shopDomain, resolved, config, purpose: 'archived', eventKey: `manual-archive:${Date.now()}` });
  await recordEvent(shopDomain, 'archived_demand_dispatch_requested', { variantId: resolved.variantId, productId: resolved.productId, productTitle: resolved.productTitle, meta: result });
  return { success: true, ...result };
}

async function emailReady(shopDomain) {
  const settings = await EmailProviderSettings.findOne({ shopDomain }).select('enabled smtpPassEncrypted fromEmail').lean();
  return Boolean(settings?.enabled && settings?.smtpPassEncrypted && settings?.fromEmail);
}

async function scopeReadiness(shopDomain) {
  try {
    const data = await shopifyFetch(`/admin/oauth/access_scopes.json`, { shopDomain });
    const scopes = (data.access_scopes || []).map((x) => x.handle);
    return { readInventory:scopes.includes('read_inventory'), readCustomers:scopes.includes('read_customers'), writeCustomers:scopes.includes('write_customers'), scopes };
  } catch (error) { return { readInventory:false, readCustomers:false, writeCustomers:false, scopes:[], error:error.message }; }
}

async function ensureWebhook(shopDomain, topic, address) {
  const list = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(topic)}&limit=250`, { shopDomain });
  let webhook = (list.webhooks || []).find((x) => x.topic === topic && String(x.address || '').replace(/\/$/, '') === address.replace(/\/$/, ''));
  if (!webhook) {
    const created = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/webhooks.json`, {
      shopDomain,
      method: 'POST',
      body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
    });
    webhook = created.webhook;
  }
  return webhook || null;
}

async function registerInventoryWebhook(shopDomain) {
  if (!env.appUrl) throw new Error('APP_URL must be configured before registering notification webhooks.');
  const base = env.appUrl.replace(/\/$/, '');
  const inventoryAddress = `${base}/api/webhooks/notifications/inventory-levels-update`;
  const productAddress = `${base}/api/webhooks/notifications/products-update`;
  const [inventoryWebhook, productWebhook] = await Promise.all([
    ensureWebhook(shopDomain, RESTOCK_TOPIC, inventoryAddress),
    ensureWebhook(shopDomain, PRODUCT_UPDATE_TOPIC, productAddress),
  ]);
  const config = await getOrCreateConfig(shopDomain);
  config.webhook.id = String(inventoryWebhook?.id || '');
  config.webhook.address = inventoryAddress;
  config.webhook.status = inventoryWebhook ? 'connected' : 'unknown';
  config.webhook.installedAt = inventoryWebhook ? new Date() : null;
  config.webhook.productWebhookId = String(productWebhook?.id || '');
  config.webhook.productWebhookAddress = productAddress;
  config.webhook.productWebhookStatus = productWebhook ? 'connected' : 'unknown';
  await config.save();
  return {
    connected: Boolean(inventoryWebhook),
    productConnected: Boolean(productWebhook),
    webhook: inventoryWebhook ? { id: String(inventoryWebhook.id), topic: inventoryWebhook.topic, address: inventoryWebhook.address } : null,
    productWebhook: productWebhook ? { id: String(productWebhook.id), topic: productWebhook.topic, address: productWebhook.address } : null,
  };
}

async function inspectInventoryWebhook(shopDomain) {
  if (!env.appUrl) return { connected: false, productConnected: false, address: '', reason: 'APP_URL not configured' };
  const base = env.appUrl.replace(/\/$/, '');
  const address = `${base}/api/webhooks/notifications/inventory-levels-update`;
  const productAddress = `${base}/api/webhooks/notifications/products-update`;
  try {
    const [inventoryList, productList] = await Promise.all([
      shopifyFetch(`/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(RESTOCK_TOPIC)}&limit=250`, { shopDomain }),
      shopifyFetch(`/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(PRODUCT_UPDATE_TOPIC)}&limit=250`, { shopDomain }),
    ]);
    const webhook = (inventoryList.webhooks || []).find((x) => x.topic === RESTOCK_TOPIC && String(x.address || '').replace(/\/$/, '') === address.replace(/\/$/, ''));
    const productWebhook = (productList.webhooks || []).find((x) => x.topic === PRODUCT_UPDATE_TOPIC && String(x.address || '').replace(/\/$/, '') === productAddress.replace(/\/$/, ''));
    return { connected: Boolean(webhook), productConnected: Boolean(productWebhook), address, productAddress, webhookId: webhook ? String(webhook.id) : '', productWebhookId: productWebhook ? String(productWebhook.id) : '' };
  } catch (error) {
    return { connected: false, productConnected: false, address, productAddress, reason: error.message };
  }
}

async function listLegacyRestockCustomers(shopDomain, maxCustomers = 1000) {
  const rows=[]; let after=null; let pages=0;
  while(rows.length < maxCustomers && pages < 20){
    const data=await shopifyGraphql(shopDomain,`query NotificationLegacyDemand($first:Int!,$after:String,$query:String!){customers(first:$first,after:$after,query:$query){pageInfo{hasNextPage endCursor}nodes{id legacyResourceId email tags updatedAt metafield(namespace:"custom",key:"notification_latest"){value}}}}`,{first:Math.min(100,maxCustomers-rows.length),after,query:'tag:restock-notif'});
    const conn=data?.customers; rows.push(...(conn?.nodes||[])); pages+=1; if(!conn?.pageInfo?.hasNextPage)break; after=conn.pageInfo.endCursor;
  }
  return rows;
}
async function resolveVariantsBulk(shopDomain, variantIds = []) {
  const ids = Array.from(new Set(variantIds.map((v) => String(v).replace(/[^0-9]/g, '')).filter(Boolean)));
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await shopifyGraphql(shopDomain, `query NotificationDemandVariants($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{id legacyResourceId title availableForSale inventoryQuantity product{id legacyResourceId title handle status publishedAt featuredImage{url}}}}}`, { ids: chunk.map((id) => `gid://shopify/ProductVariant/${id}`) });
    for (const v of data?.nodes || []) {
      if (!v) continue;
      const id = String(v.legacyResourceId || String(v.id || '').split('/').pop());
      out.set(id, {
        variantId: id,
        variantTitle: v.title || '',
        availableForSale: Boolean(v.availableForSale),
        inventoryQuantity: Number(v.inventoryQuantity || 0),
        productId: String(v.product?.legacyResourceId || String(v.product?.id || '').split('/').pop()),
        productTitle: v.product?.title || '',
        productHandle: v.product?.handle || '',
        productImage: v.product?.featuredImage?.url || '',
        productUrl: v.product?.handle ? `https://${shopDomain}/products/${v.product.handle}?variant=${id}` : '',
        productStatus: String(v.product?.status || '').toUpperCase(),
        publishedAt: v.product?.publishedAt || null,
      });
    }
  }
  return out;
}

async function listRestockDemand(shopDomain) {
  const [legacy, local] = await Promise.all([
    listLegacyRestockCustomers(shopDomain),
    RestockSubscription.find({ shopDomain, status: { $in: ['active', 'sending'] } })
      .select('variantId emailHash subscribedAt productTitle productId variantTitle productUrl productImage')
      .lean(),
  ]);
  const map = new Map();
  const ensure = (id) => {
    const key = String(id || '').replace(/[^0-9]/g, '');
    if (!key) return null;
    if (!map.has(key)) map.set(key, { variantId: key, legacyKeys: new Set(), localKeys: new Set(), firstRequestedAt: null });
    return map.get(key);
  };
  for (const c of legacy) {
    for (const tag of c.tags || []) {
      const m = String(tag).match(/^restock_id_(\d+)$/i);
      if (!m) continue;
      const item = ensure(m[1]); if (!item) continue;
      let key = String(c.id || c.email || '');
      try { if (c.email) key = emailHash(shopDomain, c.email); } catch (_) {}
      item.legacyKeys.add(key);
      if (c.updatedAt && (!item.firstRequestedAt || new Date(c.updatedAt) < new Date(item.firstRequestedAt))) item.firstRequestedAt = c.updatedAt;
    }
  }
  for (const row of local) {
    const item = ensure(row.variantId); if (!item) continue;
    item.localKeys.add(row.emailHash);
    if (row.subscribedAt && (!item.firstRequestedAt || new Date(row.subscribedAt) < new Date(item.firstRequestedAt))) item.firstRequestedAt = row.subscribedAt;
    item.local = row;
  }
  const variantIds = [...map.keys()];
  const [resolved, observations] = await Promise.all([
    resolveVariantsBulk(shopDomain, variantIds),
    StockObservation.find({ shopDomain, variantId: { $in: variantIds } }).lean(),
  ]);
  const obsByVariant = new Map(observations.map((x) => [String(x.variantId), x]));
  const allItems = [...map.values()].map((item) => {
    const all = new Set([...item.legacyKeys, ...item.localKeys]);
    const r = resolved.get(item.variantId) || {};
    const obs = obsByVariant.get(item.variantId) || {};
    const productStatus = String(r.productStatus || obs.productStatus || '').toUpperCase();
    const publishedAt = r.publishedAt || obs.publishedAt || null;
    const missing = !resolved.has(item.variantId);
    const live = !missing && productStatus === 'ACTIVE' && Boolean(publishedAt);
    const archived = productStatus === 'ARCHIVED';
    return {
      ...r,
      variantId: item.variantId,
      productTitle: r.productTitle || item.local?.productTitle || obs.productTitle || 'Unknown product',
      productId: r.productId || item.local?.productId || obs.productId || '',
      variantTitle: r.variantTitle || item.local?.variantTitle || obs.variantTitle || '',
      productUrl: r.productUrl || item.local?.productUrl || '',
      productImage: r.productImage || item.local?.productImage || obs.productImage || '',
      productStatus,
      publishedAt,
      live,
      archived,
      missing,
      legacyWaiting: item.legacyKeys.size,
      elev8Waiting: item.localKeys.size,
      totalWaiting: all.size,
      firstRequestedAt: item.firstRequestedAt,
      lastInStockAt: obs.lastInStockAt || null,
      outOfStockSince: obs.outOfStockSince || null,
      lastObservedAt: obs.lastObservedAt || null,
    };
  }).sort((a, b) => b.totalWaiting - a.totalWaiting || String(a.productTitle).localeCompare(String(b.productTitle)));
  const items = allItems.filter((x) => x.live);
  const archivedItems = allItems.filter((x) => x.archived);
  const hiddenItems = allItems.filter((x) => !x.live && !x.archived && !x.missing);
  const missingItems = allItems.filter((x) => x.missing);
  const totalCustomers = (rows) => rows.reduce((n, x) => n + Number(x.totalWaiting || 0), 0);
  return {
    items,
    archivedItems,
    hiddenItems,
    missingItems,
    totals: {
      products: items.length,
      customers: totalCustomers(items),
      archivedProducts: archivedItems.length,
      archivedCustomers: totalCustomers(archivedItems),
      hiddenProducts: hiddenItems.length,
      missingProducts: missingItems.length,
      allWatchedVariants: allItems.length,
      legacyCustomers: new Set(legacy.map((c) => c.id)).size,
      elev8Subscriptions: local.length,
    },
    refreshedAt: new Date().toISOString(),
    source: 'shopify_customer_tags+elev8+stock_history',
  };
}

function buildFlowTemplate(config, shopDomain, templateType = 'restock') {
  const vars=config.delivery?.flowVariables||{};
  const tokens={product_title:vars.productTitle||'{{ product.title }}',variant_title:vars.variantTitle||'{{ productVariant.title }}',product_url:vars.productUrl||'https://{{ shop.myShopifyDomain }}/products/{{ product.handle }}?variant={{ productVariant.legacyResourceId }}',product_image:vars.productImage||''};
  const rendered=templateType==='archived'?renderArchivedEmailHtml(config,tokens):renderRestockEmailHtml(config,tokens);
  return {templateType,subject:rendered.subject,html:rendered.html,variables:vars,connections:flowConnectionDefinitions(config),selectedConnection:templateType==='archived'?(config.delivery?.archivedFlowConnectionKey||'none'):(config.delivery?.flowConnectionKey||'legacy-tags')};
}

async function adminSummary(shopDomain) {
  const since30 = new Date(Date.now() - 30 * 86400 * 1000);
  const [active, sent30, failed30, waitingProducts, recent, config, emailOk, webhook, scopes] = await Promise.all([
    RestockSubscription.countDocuments({ shopDomain, status: 'active' }),
    NotificationEvent.countDocuments({ shopDomain, type: 'restock_sent', occurredAt: { $gte: since30 } }),
    NotificationEvent.countDocuments({ shopDomain, type: 'restock_failed', occurredAt: { $gte: since30 } }),
    RestockSubscription.aggregate([
      { $match: { shopDomain, status: 'active' } },
      { $group: { _id: { variantId: '$variantId', productId: '$productId', productTitle: '$productTitle', variantTitle: '$variantTitle' }, waiting: { $sum: 1 }, firstSubscribedAt: { $min: '$subscribedAt' } } },
      { $sort: { waiting: -1, firstSubscribedAt: 1 } },
      { $limit: 12 },
    ]),
    NotificationEvent.find({ shopDomain }).sort({ occurredAt: -1 }).limit(20).lean(),
    getOrCreateConfig(shopDomain),
    emailReady(shopDomain),
    inspectInventoryWebhook(shopDomain),
    scopeReadiness(shopDomain),
  ]);
  return {
    stats: { active, productsWaiting: waitingProducts.length, sent30, failed30 },
    waitingProducts: waitingProducts.map((x) => ({ variantId: x._id.variantId, productId: x._id.productId, productTitle: x._id.productTitle, variantTitle: x._id.variantTitle, waiting: x.waiting, firstSubscribedAt: x.firstSubscribedAt })),
    recent,
    readiness: { email: emailOk, webhook: webhook.connected, productWebhook: Boolean(webhook.productConnected), readInventoryScope: scopes.readInventory, readCustomersScope: scopes.readCustomers, writeCustomersScope: scopes.writeCustomers, deliveryMode: config.delivery?.mode || 'flow', flowConfigured: flowConnectionDefinitions(config).some((x)=>x.purpose==='restock'&&x.connected), flowConnections: flowConnectionDefinitions(config), selectedFlowConnection: config.delivery?.flowConnectionKey || 'legacy-tags', selectedArchivedFlowConnection: config.delivery?.archivedFlowConnectionKey || 'none', webhookAddress: webhook.address || '', webhookReason: webhook.reason || '', scopeError: scopes.error || '' },
    config: publicStorefrontConfig(config),
  };
}

async function listSubscriptions(shopDomain, { status = '', search = '', limit = 100 } = {}) {
  const query = { shopDomain };
  if (status && ['active','sending','sent','unsubscribed'].includes(status)) query.status = status;
  if (search) query.$or = [{ productTitle: { $regex: cleanText(search, 120), $options: 'i' } }, { variantTitle: { $regex: cleanText(search, 120), $options: 'i' } }];
  const rows = await RestockSubscription.find(query).sort({ updatedAt: -1 }).limit(clampNumber(limit, 1, 250, 100)).lean();
  return rows.map((row) => ({
    id: String(row._id), requesterRef: publicRef(row.emailHash), variantId: row.variantId, productId: row.productId, productTitle: row.productTitle,
    variantTitle: row.variantTitle, productUrl: row.productUrl, productImage: row.productImage, status: row.status,
    subscribedAt: row.subscribedAt, sentAt: row.sentAt, unsubscribedAt: row.unsubscribedAt,
    sendAttempts: row.sendAttempts, lastError: redactText(row.lastError || ''),
  }));
}

async function listEvents(shopDomain, limit = 100) {
  return NotificationEvent.find({ shopDomain }).sort({ occurredAt: -1 }).limit(clampNumber(limit, 1, 250, 100)).lean();
}

async function getAdminConfig(shopDomain) {
  const config = await getOrCreateConfig(shopDomain);
  return config.toObject();
}

async function updateAdminConfig(shopDomain, body = {}) {
  const config = await getOrCreateConfig(shopDomain);
  if (body.enabled !== undefined) config.enabled = Boolean(body.enabled);
  if (body.restockEnabled !== undefined) config.restockEnabled = Boolean(body.restockEnabled);
  if (body.sendThreshold !== undefined) config.sendThreshold = clampNumber(body.sendThreshold, 1, 9999, 1);
  if (body.oneShot !== undefined) config.oneShot = Boolean(body.oneShot);
  if (body.archiveNotifications?.enabled !== undefined) config.archiveNotifications.enabled = Boolean(body.archiveNotifications.enabled);
  if (body.archiveNotifications?.autoSend !== undefined) config.archiveNotifications.autoSend = Boolean(body.archiveNotifications.autoSend);
  const delivery = body.delivery || {};
  if (['flow','elev8'].includes(delivery.mode)) config.delivery.mode = delivery.mode;
  if (delivery.syncShopifyTags !== undefined) config.delivery.syncShopifyTags = Boolean(delivery.syncShopifyTags);
  if (delivery.flowUrl !== undefined) config.delivery.flowUrl = cleanText(delivery.flowUrl, 1000);
  if (delivery.flowName !== undefined) config.delivery.flowName = cleanText(delivery.flowName, 160);
  if (delivery.flowConnectionKey !== undefined) config.delivery.flowConnectionKey = cleanText(delivery.flowConnectionKey, 80) || 'legacy-tags';
  if (delivery.archivedFlowConnectionKey !== undefined) config.delivery.archivedFlowConnectionKey = cleanText(delivery.archivedFlowConnectionKey, 80) || 'none';
  const fv = delivery.flowVariables || {};
  if (fv.productTitle !== undefined) config.delivery.flowVariables.productTitle = cleanText(fv.productTitle, 500);
  if (fv.variantTitle !== undefined) config.delivery.flowVariables.variantTitle = cleanText(fv.variantTitle, 500);
  if (fv.productUrl !== undefined) config.delivery.flowVariables.productUrl = cleanText(fv.productUrl, 1000);
  if (fv.productImage !== undefined) config.delivery.flowVariables.productImage = cleanText(fv.productImage, 1000);
  const sf = body.storefront || {};
  if (sf.inStockLabel !== undefined) config.storefront.inStockLabel = cleanText(sf.inStockLabel, 80);
  if (/^#[0-9a-f]{6}$/i.test(String(sf.inStockBackground || ''))) config.storefront.inStockBackground = sf.inStockBackground;
  if (/^#[0-9a-f]{6}$/i.test(String(sf.inStockTextColor || ''))) config.storefront.inStockTextColor = sf.inStockTextColor;
  if (sf.soldOutLabel !== undefined) config.storefront.soldOutLabel = cleanText(sf.soldOutLabel, 80);
  if (sf.subscribedLabel !== undefined) config.storefront.subscribedLabel = cleanText(sf.subscribedLabel, 80);
  if (sf.removeLabel !== undefined) config.storefront.removeLabel = cleanText(sf.removeLabel, 80);
  if (sf.modalTitle !== undefined) config.storefront.modalTitle = cleanText(sf.modalTitle, 120);
  if (sf.modalCopy !== undefined) config.storefront.modalCopy = cleanText(sf.modalCopy, 320);
  if (['outline','solid'].includes(sf.style)) config.storefront.style = sf.style;
  if (/^#[0-9a-f]{6}$/i.test(String(sf.background || ''))) config.storefront.background = sf.background;
  if (/^#[0-9a-f]{6}$/i.test(String(sf.textColor || ''))) config.storefront.textColor = sf.textColor;
  if (/^#[0-9a-f]{6}$/i.test(String(sf.outlineColor || ''))) config.storefront.outlineColor = sf.outlineColor;
  if (sf.radius !== undefined) config.storefront.radius = clampNumber(sf.radius, 0, 30, 8);
  if (sf.height !== undefined) config.storefront.height = clampNumber(sf.height, 44, 72, 56);
  if (sf.showBellIcon !== undefined) config.storefront.showBellIcon = Boolean(sf.showBellIcon);
  const em = body.email || {};
  if (em.subject !== undefined) config.email.subject = cleanText(em.subject, 180);
  if (em.preheader !== undefined) config.email.preheader = cleanText(em.preheader, 320);
  if (em.eyebrow !== undefined) config.email.eyebrow = cleanText(em.eyebrow, 80);
  if (em.heading !== undefined) config.email.heading = cleanText(em.heading, 180);
  if (em.body !== undefined) config.email.body = cleanText(em.body, 1200);
  if (em.buttonLabel !== undefined) config.email.buttonLabel = cleanText(em.buttonLabel, 80);
  if (em.footer !== undefined) config.email.footer = cleanText(em.footer, 500);
  if (em.logoUrl !== undefined) config.email.logoUrl = cleanText(em.logoUrl, 1000);
  if (em.showProductImage !== undefined) config.email.showProductImage = Boolean(em.showProductImage);
  if (em.showVariant !== undefined) config.email.showVariant = Boolean(em.showVariant);
  if (['left','center'].includes(em.align)) config.email.align = em.align;
  for (const [key,fallback] of [['backgroundColor','#f5f7f8'],['cardColor','#ffffff'],['accentColor','#17657a'],['textColor','#111827'],['mutedTextColor','#667085'],['buttonBackground','#111827'],['buttonTextColor','#ffffff']]) if (/^#[0-9a-f]{6}$/i.test(String(em[key]||''))) config.email[key]=em[key];
  if (em.buttonRadius !== undefined) config.email.buttonRadius = clampNumber(em.buttonRadius,0,30,9);
  if (em.cardRadius !== undefined) config.email.cardRadius = clampNumber(em.cardRadius,0,36,18);
  if (em.imageRadius !== undefined) config.email.imageRadius = clampNumber(em.imageRadius,0,36,14);
  if (em.contentWidth !== undefined) config.email.contentWidth = clampNumber(em.contentWidth,420,760,620);
  const ae = body.archivedEmail || {};
  if (ae.subject !== undefined) config.archivedEmail.subject = cleanText(ae.subject, 180);
  if (ae.preheader !== undefined) config.archivedEmail.preheader = cleanText(ae.preheader, 320);
  if (ae.eyebrow !== undefined) config.archivedEmail.eyebrow = cleanText(ae.eyebrow, 80);
  if (ae.heading !== undefined) config.archivedEmail.heading = cleanText(ae.heading, 180);
  if (ae.body !== undefined) config.archivedEmail.body = cleanText(ae.body, 1200);
  if (ae.buttonLabel !== undefined) config.archivedEmail.buttonLabel = cleanText(ae.buttonLabel, 80);
  if (ae.footer !== undefined) config.archivedEmail.footer = cleanText(ae.footer, 500);
  if (ae.logoUrl !== undefined) config.archivedEmail.logoUrl = cleanText(ae.logoUrl, 1000);
  if (ae.showProductImage !== undefined) config.archivedEmail.showProductImage = Boolean(ae.showProductImage);
  if (ae.showVariant !== undefined) config.archivedEmail.showVariant = Boolean(ae.showVariant);
  if (['left','center'].includes(ae.align)) config.archivedEmail.align = ae.align;
  for (const [key] of [['backgroundColor'],['cardColor'],['accentColor'],['textColor'],['mutedTextColor'],['buttonBackground'],['buttonTextColor']]) if (/^#[0-9a-f]{6}$/i.test(String(ae[key]||''))) config.archivedEmail[key]=ae[key];
  if (ae.buttonRadius !== undefined) config.archivedEmail.buttonRadius = clampNumber(ae.buttonRadius,0,30,9);
  if (ae.cardRadius !== undefined) config.archivedEmail.cardRadius = clampNumber(ae.cardRadius,0,36,18);
  if (ae.imageRadius !== undefined) config.archivedEmail.imageRadius = clampNumber(ae.imageRadius,0,36,14);
  if (ae.contentWidth !== undefined) config.archivedEmail.contentWidth = clampNumber(ae.contentWidth,420,760,620);
  await config.save();
  return config.toObject();
}

async function sendTestEmail(shopDomain, email, templateType = 'restock') {
  const recipient = cleanEmail(email);
  if (!recipient) throw publicError('Enter a valid test email.', 400);
  const config = await getOrCreateConfig(shopDomain);
  const fake = { emailEncrypted: encryptSecret(recipient), productTitle: 'Example product', variantTitle: 'Example variant', productUrl: `https://${shopDomain}/collections/all`, productImage: '' };
  if (templateType === 'archived') {
    const emailSettings = await activeEmailSettings(shopDomain);
    const tokens = { product_title: fake.productTitle, variant_title: fake.variantTitle, product_url: fake.productUrl, product_image: '' };
    const rendered = renderArchivedEmailHtml(config, tokens);
    const transporter = createTransporter(emailSettings);
    await transporter.sendMail({ from:emailSettings.fromName?`"${String(emailSettings.fromName).replace(/"/g,'')}" <${emailSettings.fromEmail}>`:emailSettings.fromEmail, to:recipient, replyTo:emailSettings.replyToEmail||emailSettings.fromEmail, subject:rendered.subject, html:rendered.html, text:rendered.text });
  } else {
    await sendRestockEmail({ shopDomain, subscription: fake, config });
  }
  return { success: true, templateType };
}

module.exports = {
  RESTOCK_TOPIC,
  PRODUCT_UPDATE_TOPIC,
  getOrCreateConfig,
  publicStorefrontConfig,
  getSubscriptionStatus,
  subscribeRestock,
  unsubscribeRestock,
  processInventoryLevelUpdate,
  processProductUpdate,
  dispatchArchivedDemand,
  recordFlowLifecycle,
  listFlowConnections,
  registerInventoryWebhook,
  inspectInventoryWebhook,
  adminSummary,
  listSubscriptions,
  listEvents,
  listRestockDemand,
  buildFlowTemplate,
  getAdminConfig,
  updateAdminConfig,
  sendTestEmail,
};
