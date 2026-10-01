const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { env } = require('../../config/env');
const { EmailProviderSettings } = require('../../models');
const { encryptSecret, decryptSecret } = require('../../utils/crypto');
const { cleanEmail, cleanText, clampNumber } = require('../../utils/validation');
const { shopifyFetch } = require('../../utils/shopify');
const { NotificationConfig, RestockSubscription, NotificationEvent } = require('./notifications.models');

const RESTOCK_TOPIC = 'inventory_levels/update';

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
  return NotificationEvent.create({ shopDomain, type, ...payload, occurredAt: new Date() });
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
    try { await syncShopifyRestockTags({ shopDomain, email: normalizedEmail, resolved, action: 'add' }); shopifySynced = true; }
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
  const data = await shopifyGraphql(shopDomain, `query NotificationInventoryItem($id: ID!) { inventoryItem(id: $id) { id variants(first: 1) { nodes { id legacyResourceId title availableForSale product { id legacyResourceId title handle featuredImage { url } } } } } }`, { id: gid });
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
  };
}

async function processInventoryLevelUpdate({ shopDomain, inventoryItemId, available, webhookId = '' }) {
  const config = await getOrCreateConfig(shopDomain);
  config.webhook.lastReceivedAt = new Date();
  config.webhook.lastInventoryItemId = String(inventoryItemId || '');
  await config.save();
  if (config.enabled === false || config.restockEnabled === false) return { skipped: 'disabled' };
  if (Number(available || 0) < Number(config.sendThreshold || 1)) return { skipped: 'below_threshold' };
  const resolved = await resolveInventoryVariant(shopDomain, inventoryItemId);
  if (!resolved?.variantId || !resolved.availableForSale) return { skipped: 'not_available_for_sale' };
  if ((config.delivery?.mode || 'flow') === 'flow') {
    await recordEvent(shopDomain, 'restock_flow_inventory_ready', { variantId: resolved.variantId, productId: resolved.productId, productTitle: resolved.productTitle, meta: { webhookId, available: Number(available || 0) } });
    return { delegated: 'shopify_flow', variantId: resolved.variantId };
  }

  const candidates = await RestockSubscription.find({
    shopDomain,
    variantId: resolved.variantId,
    status: 'active',
    sendAttempts: { $lt: 3 },
  }).sort({ subscribedAt: 1 }).limit(1000);

  let sent = 0;
  let failed = 0;
  const workers = Math.min(5, Math.max(1, candidates.length));
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const item = candidates[cursor++];
      const claimed = await RestockSubscription.findOneAndUpdate(
        { _id: item._id, status: 'active' },
        { $set: { status: 'sending', lastAttemptAt: new Date(), lastWebhookId: webhookId }, $inc: { sendAttempts: 1 } },
        { new: true }
      );
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
        await recordEvent(shopDomain, 'restock_sent', { variantId: claimed.variantId, productId: claimed.productId, productTitle: claimed.productTitle, emailHash: claimed.emailHash, meta: { webhookId } });
        sent += 1;
      } catch (error) {
        await RestockSubscription.updateOne({ _id: claimed._id }, { $set: { status: 'active', lastError: String(error.message || error).slice(0, 500) } });
        await recordEvent(shopDomain, 'restock_failed', { variantId: claimed.variantId, productId: claimed.productId, productTitle: claimed.productTitle, emailHash: claimed.emailHash, detail: String(error.message || error).slice(0, 500), meta: { webhookId } });
        failed += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { sent, failed, variantId: resolved.variantId };
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

async function registerInventoryWebhook(shopDomain) {
  if (!env.appUrl) throw new Error('APP_URL must be configured before registering the inventory webhook.');
  const address = `${env.appUrl.replace(/\/$/, '')}/api/webhooks/notifications/inventory-levels-update`;
  const list = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(RESTOCK_TOPIC)}&limit=250`, { shopDomain });
  let webhook = (list.webhooks || []).find((x) => x.topic === RESTOCK_TOPIC && String(x.address || '').replace(/\/$/, '') === address.replace(/\/$/, ''));
  if (!webhook) {
    const created = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/webhooks.json`, {
      shopDomain,
      method: 'POST',
      body: JSON.stringify({ webhook: { topic: RESTOCK_TOPIC, address, format: 'json' } }),
    });
    webhook = created.webhook;
  }
  const config = await getOrCreateConfig(shopDomain);
  config.webhook.id = String(webhook?.id || '');
  config.webhook.address = address;
  config.webhook.status = webhook ? 'connected' : 'unknown';
  config.webhook.installedAt = webhook ? new Date() : null;
  await config.save();
  return { connected: Boolean(webhook), webhook: webhook ? { id: String(webhook.id), topic: webhook.topic, address: webhook.address } : null };
}

async function inspectInventoryWebhook(shopDomain) {
  if (!env.appUrl) return { connected: false, address: '', reason: 'APP_URL not configured' };
  const address = `${env.appUrl.replace(/\/$/, '')}/api/webhooks/notifications/inventory-levels-update`;
  try {
    const list = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(RESTOCK_TOPIC)}&limit=250`, { shopDomain });
    const webhook = (list.webhooks || []).find((x) => x.topic === RESTOCK_TOPIC && String(x.address || '').replace(/\/$/, '') === address.replace(/\/$/, ''));
    return { connected: Boolean(webhook), address, webhookId: webhook ? String(webhook.id) : '' };
  } catch (error) {
    return { connected: false, address, reason: error.message };
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
  const ids=Array.from(new Set(variantIds.map((v)=>String(v).replace(/[^0-9]/g,'')).filter(Boolean))); const out=new Map();
  for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50);const data=await shopifyGraphql(shopDomain,`query NotificationDemandVariants($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{id legacyResourceId title availableForSale inventoryQuantity product{id legacyResourceId title handle featuredImage{url}}}}}`,{ids:chunk.map((id)=>`gid://shopify/ProductVariant/${id}`)});for(const v of data?.nodes||[]){if(!v)continue;const id=String(v.legacyResourceId||String(v.id||'').split('/').pop());out.set(id,{variantId:id,variantTitle:v.title||'',availableForSale:Boolean(v.availableForSale),inventoryQuantity:Number(v.inventoryQuantity||0),productId:String(v.product?.legacyResourceId||String(v.product?.id||'').split('/').pop()),productTitle:v.product?.title||'',productHandle:v.product?.handle||'',productImage:v.product?.featuredImage?.url||'',productUrl:v.product?.handle?`https://${shopDomain}/products/${v.product.handle}?variant=${id}`:''});}}
  return out;
}
async function listRestockDemand(shopDomain) {
  const [legacy,local]=await Promise.all([listLegacyRestockCustomers(shopDomain),RestockSubscription.find({shopDomain,status:{$in:['active','sending']}}).select('variantId emailHash subscribedAt productTitle productId variantTitle productUrl productImage').lean()]);
  const map=new Map(); const ensure=(id)=>{const key=String(id||'').replace(/[^0-9]/g,'');if(!key)return null;if(!map.has(key))map.set(key,{variantId:key,legacyKeys:new Set(),localKeys:new Set(),legacyCustomers:[],firstRequestedAt:null});return map.get(key)};
  for(const c of legacy){for(const tag of c.tags||[]){const m=String(tag).match(/^restock_id_(\d+)$/i);if(!m)continue;const item=ensure(m[1]);if(!item)continue;let key=String(c.id||c.email||'');try{if(c.email)key=emailHash(shopDomain,c.email)}catch(_){}item.legacyKeys.add(key);if(item.legacyCustomers.length<6)item.legacyCustomers.push({email:maskEmail(c.email||''),updatedAt:c.updatedAt||null});if(c.updatedAt&&(!item.firstRequestedAt||new Date(c.updatedAt)<new Date(item.firstRequestedAt)))item.firstRequestedAt=c.updatedAt;}}
  for(const row of local){const item=ensure(row.variantId);if(!item)continue;item.localKeys.add(row.emailHash);if(row.subscribedAt&&(!item.firstRequestedAt||new Date(row.subscribedAt)<new Date(item.firstRequestedAt)))item.firstRequestedAt=row.subscribedAt;item.local=row;}
  const resolved=await resolveVariantsBulk(shopDomain,[...map.keys()]);
  const items=[...map.values()].map((item)=>{const all=new Set([...item.legacyKeys,...item.localKeys]);const r=resolved.get(item.variantId)||{};return {...r,variantId:item.variantId,productTitle:r.productTitle||item.local?.productTitle||'Unknown product',productId:r.productId||item.local?.productId||'',variantTitle:r.variantTitle||item.local?.variantTitle||'',productUrl:r.productUrl||item.local?.productUrl||'',productImage:r.productImage||item.local?.productImage||'',legacyWaiting:item.legacyKeys.size,elev8Waiting:item.localKeys.size,totalWaiting:all.size,firstRequestedAt:item.firstRequestedAt,legacyCustomers:item.legacyCustomers};}).sort((a,b)=>b.totalWaiting-a.totalWaiting||String(a.productTitle).localeCompare(String(b.productTitle)));
  return {items,totals:{products:items.length,customers:items.reduce((n,x)=>n+x.totalWaiting,0),legacyCustomers:new Set(legacy.map((c)=>c.id)).size,elev8Subscriptions:local.length},refreshedAt:new Date().toISOString(),source:'shopify_customer_tags+elev8'};
}
function buildFlowTemplate(config, shopDomain) {
  const vars=config.delivery?.flowVariables||{};const tokens={product_title:vars.productTitle||'{{ product.title }}',variant_title:vars.variantTitle||'{{ productVariant.title }}',product_url:vars.productUrl||'https://{{ shop.myShopifyDomain }}/products/{{ product.handle }}?variant={{ productVariant.legacyResourceId }}',product_image:vars.productImage||''};
  const rendered=renderRestockEmailHtml(config,tokens);return {subject:rendered.subject,html:rendered.html,flowUrl:config.delivery?.flowUrl||flowAdminFallback(shopDomain),flowName:config.delivery?.flowName||'Back in stock notifications',variables:vars};
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
    readiness: { email: emailOk, webhook: webhook.connected, readInventoryScope: scopes.readInventory, readCustomersScope: scopes.readCustomers, writeCustomersScope: scopes.writeCustomers, deliveryMode: config.delivery?.mode || 'flow', flowConfigured: Boolean(config.delivery?.flowUrl), flowUrl: config.delivery?.flowUrl || flowAdminFallback(shopDomain), webhookAddress: webhook.address || '', webhookReason: webhook.reason || '', scopeError: scopes.error || '' },
    config: publicStorefrontConfig(config),
  };
}

async function listSubscriptions(shopDomain, { status = '', search = '', limit = 100 } = {}) {
  const query = { shopDomain };
  if (status && ['active','sending','sent','unsubscribed'].includes(status)) query.status = status;
  if (search) query.$or = [{ productTitle: { $regex: cleanText(search, 120), $options: 'i' } }, { variantTitle: { $regex: cleanText(search, 120), $options: 'i' } }];
  const rows = await RestockSubscription.find(query).sort({ updatedAt: -1 }).limit(clampNumber(limit, 1, 250, 100)).lean();
  return rows.map((row) => {
    let email = '';
    try { email = decryptSecret(row.emailEncrypted); } catch (_) {}
    return {
      id: String(row._id), variantId: row.variantId, productId: row.productId, productTitle: row.productTitle,
      variantTitle: row.variantTitle, productUrl: row.productUrl, productImage: row.productImage, status: row.status,
      email: maskEmail(email), subscribedAt: row.subscribedAt, sentAt: row.sentAt, unsubscribedAt: row.unsubscribedAt,
      sendAttempts: row.sendAttempts, lastError: row.lastError,
    };
  });
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
  const delivery = body.delivery || {};
  if (['flow','elev8'].includes(delivery.mode)) config.delivery.mode = delivery.mode;
  if (delivery.syncShopifyTags !== undefined) config.delivery.syncShopifyTags = Boolean(delivery.syncShopifyTags);
  if (delivery.flowUrl !== undefined) config.delivery.flowUrl = cleanText(delivery.flowUrl, 1000);
  if (delivery.flowName !== undefined) config.delivery.flowName = cleanText(delivery.flowName, 160);
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
  await config.save();
  return config.toObject();
}

async function sendTestEmail(shopDomain, email) {
  const recipient = cleanEmail(email);
  if (!recipient) throw publicError('Enter a valid test email.', 400);
  const config = await getOrCreateConfig(shopDomain);
  const fake = {
    emailEncrypted: encryptSecret(recipient), productTitle: 'Example product', variantTitle: 'Example variant',
    productUrl: `https://${shopDomain}/collections/all`, productImage: '',
  };
  await sendRestockEmail({ shopDomain, subscription: fake, config });
  return { success: true };
}

module.exports = {
  RESTOCK_TOPIC,
  getOrCreateConfig,
  publicStorefrontConfig,
  getSubscriptionStatus,
  subscribeRestock,
  unsubscribeRestock,
  processInventoryLevelUpdate,
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
