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

async function subscribeRestock({ shopDomain, email, variantId, source = 'storefront' }) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail) throw publicError('Please enter a valid email address.', 400);
  if (!variantId) throw publicError('Missing variant id.', 400);
  const config = await getOrCreateConfig(shopDomain);
  if (config.enabled === false || config.restockEnabled === false) {
    throw publicError('Back-in-stock notifications are not enabled for this store.', 409);
  }
  const resolved = await resolveSubscriptionVariant(shopDomain, variantId);
  if (resolved.availableForSale) throw publicError('This item is already back in stock. Refresh the page to add it to your cart.', 409);
  const key = emailHash(shopDomain, normalizedEmail);
  const now = new Date();
  const row = await RestockSubscription.findOneAndUpdate(
    { shopDomain, emailHash: key, variantId: resolved.variantId },
    {
      $set: {
        emailEncrypted: encryptSecret(normalizedEmail),
        productId: cleanText(resolved.productId, 80),
        productTitle: cleanText(resolved.productTitle, 240),
        productHandle: cleanText(resolved.productHandle, 240),
        productUrl: cleanText(resolved.productUrl, 800),
        productImage: cleanText(resolved.productImage, 1200),
        variantTitle: cleanText(resolved.variantTitle, 240),
        source: cleanText(source, 60) || 'storefront',
        status: 'active',
        subscribedAt: now,
        sentAt: null,
        unsubscribedAt: null,
        lastError: '',
      },
      $setOnInsert: { shopDomain, emailHash: key, variantId: resolved.variantId, sendAttempts: 0 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await recordEvent(shopDomain, 'restock_subscribed', {
    variantId: row.variantId,
    productId: row.productId,
    productTitle: row.productTitle,
    emailHash: key,
  });
  return { success: true, subscribed: true, status: row.status };
}

async function unsubscribeRestock({ shopDomain, email, variantId }) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail || !variantId) return { success: true, subscribed: false, status: 'none' };
  const key = emailHash(shopDomain, normalizedEmail);
  const row = await RestockSubscription.findOneAndUpdate(
    { shopDomain, emailHash: key, variantId: String(variantId) },
    { $set: { status: 'unsubscribed', unsubscribedAt: new Date(), lastError: '' } },
    { new: true }
  );
  if (row) await recordEvent(shopDomain, 'restock_unsubscribed', {
    variantId: row.variantId,
    productId: row.productId,
    productTitle: row.productTitle,
    emailHash: key,
  });
  return { success: true, subscribed: false, status: row ? 'unsubscribed' : 'none' };
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

async function sendRestockEmail({ shopDomain, subscription, config }) {
  const emailSettings = await activeEmailSettings(shopDomain);
  const recipient = decryptSecret(subscription.emailEncrypted);
  const productUrl = absoluteProductUrl(shopDomain, subscription.productUrl || (subscription.productHandle ? `/products/${subscription.productHandle}` : ''));
  const tokens = {
    product_title: subscription.productTitle || 'Your item',
    variant_title: subscription.variantTitle || '',
    product_url: productUrl,
  };
  const subject = replaceTokens(config.email?.subject || '{{ product_title }} is back in stock', tokens);
  const heading = replaceTokens(config.email?.heading || 'It’s back.', tokens);
  const body = replaceTokens(config.email?.body || '{{ product_title }} is available again.', tokens);
  const buttonLabel = replaceTokens(config.email?.buttonLabel || 'Shop now', tokens);
  const footer = replaceTokens(config.email?.footer || '', tokens);
  const image = subscription.productImage ? `<img src="${escapeHtml(subscription.productImage)}" alt="" style="display:block;width:100%;max-width:360px;height:auto;margin:0 auto 24px;border-radius:14px">` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827"><div style="max-width:620px;margin:0 auto;padding:34px 18px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:34px;text-align:center">${image}<p style="margin:0 0 8px;color:#17657a;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Back in stock</p><h1 style="margin:0 0 14px;font-size:30px;letter-spacing:-.03em">${escapeHtml(heading)}</h1><p style="margin:0 auto 24px;max-width:470px;color:#5f6b76;line-height:1.6">${escapeHtml(body)}</p><a href="${escapeHtml(productUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;border-radius:9px;padding:14px 24px;font-weight:800">${escapeHtml(buttonLabel)}</a>${footer ? `<p style="margin:28px auto 0;max-width:500px;color:#8a949e;font-size:12px;line-height:1.5">${escapeHtml(footer)}</p>` : ''}</div></div></body></html>`;
  const transporter = createTransporter(emailSettings);
  await transporter.sendMail({
    from: emailSettings.fromName ? `"${String(emailSettings.fromName).replace(/"/g, '')}" <${emailSettings.fromEmail}>` : emailSettings.fromEmail,
    to: recipient,
    replyTo: emailSettings.replyToEmail || emailSettings.fromEmail,
    subject,
    html,
    text: `${heading}\n\n${body}\n\n${productUrl}`,
  });
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
    return { readInventory: scopes.includes('read_inventory'), scopes };
  } catch (error) {
    return { readInventory: false, scopes: [], error: error.message };
  }
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
    readiness: { email: emailOk, webhook: webhook.connected, readInventoryScope: scopes.readInventory, webhookAddress: webhook.address || '', webhookReason: webhook.reason || '', scopeError: scopes.error || '' },
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
  if (em.heading !== undefined) config.email.heading = cleanText(em.heading, 180);
  if (em.body !== undefined) config.email.body = cleanText(em.body, 1200);
  if (em.buttonLabel !== undefined) config.email.buttonLabel = cleanText(em.buttonLabel, 80);
  if (em.footer !== undefined) config.email.footer = cleanText(em.footer, 500);
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
  getAdminConfig,
  updateAdminConfig,
  sendTestEmail,
};
