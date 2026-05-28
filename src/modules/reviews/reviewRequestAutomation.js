const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { env } = require('../../config/env');
const { ReviewRequestJob, CampaignEvent, EmailProviderSettings, Settings, Shop } = require('../../models');
const { cleanText, cleanEmail, clampNumber } = require('../../utils/validation');
const { decryptSecret, hashValue } = require('../../utils/crypto');
const { createReviewToken } = require('../../utils/reviewTokens');
const { shopifyFetchOptional } = require('../../utils/shopify');

const DEFAULT_DELAY_DAYS = 14;
const DEFAULT_CAMPAIGN = 'native_review_request';
let schedulerStarted = false;
let schedulerTimer = null;
let schedulerRunning = false;

function createTransporterFromSettings(settings) {
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

function reviewAutomationConfig(settings = {}) {
  const cfg = settings.reviewAutomation || {};
  const mode = ['native', 'flow', 'manual'].includes(cfg.mode) ? cfg.mode : 'native';
  return {
    mode,
    nativeEnabled: cfg.nativeEnabled !== false,
    flowEnabled: Boolean(cfg.flowEnabled),
    delayDays: clampNumber(cfg.delayDays, 0, 365, DEFAULT_DELAY_DAYS),
    trigger: ['orders/fulfilled', 'fulfillments/create', 'manual'].includes(cfg.trigger) ? cfg.trigger : 'orders/fulfilled',
    sendWindowHour: clampNumber(cfg.sendWindowHour, 0, 23, 10),
    sendWindowTimezone: cleanText(cfg.sendWindowTimezone || 'store', 80),
    campaign: cleanText(cfg.campaign || DEFAULT_CAMPAIGN, 120),
    subject: cleanText(cfg.subject || 'How was your recent order?', 160),
    deliveryTagRequired: cfg.deliveryTagRequired !== false,
    deliveryTag: cleanText(cfg.deliveryTag || 'delivered', 80).toLowerCase(),
    deliveryAnchor: ['fulfilled_at', 'delivered_tag'].includes(cfg.deliveryAnchor) ? cfg.deliveryAnchor : 'delivered_tag',
    enabled: cfg.enabled !== false,
  };
}

async function getAutomationConfig(shopDomain) {
  const settings = await Settings.findOne({ shopDomain }).lean();
  return reviewAutomationConfig(settings || {});
}

function productFromLineItem(line = {}) {
  const productId = line.product_id || line.productId || line.product?.id || '';
  const variantId = line.variant_id || line.variantId || line.variant?.id || '';
  return {
    id: productId ? `gid://shopify/Product/${productId}` : cleanText(line.id || line.sku || line.title || 'unknown-product', 160),
    productId: productId ? `gid://shopify/Product/${productId}` : cleanText(line.productId || line.id || '', 160),
    variantId: variantId ? `gid://shopify/ProductVariant/${variantId}` : cleanText(line.variantId || '', 160),
    title: cleanText(line.title || line.name || 'Purchased product', 200),
    handle: cleanText(line.handle || '', 200),
    quantity: clampNumber(line.quantity || 1, 1, 999, 1),
  };
}

function productsFromOrder(order = {}) {
  const lines = Array.isArray(order.line_items) ? order.line_items : Array.isArray(order.products) ? order.products : [];
  return lines.map(productFromLineItem).filter((product) => product.title || product.productId || product.id).slice(0, 50);
}

function resolveOrderEmail(order = {}) {
  return cleanEmail(order.email || order.contact_email || order.customer?.email || order.billing_address?.email || order.shipping_address?.email || '');
}

function resolveOrderName(order = {}) {
  const customer = order.customer || {};
  const firstLast = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  return cleanText(firstLast || order.shipping_address?.name || order.billing_address?.name || 'Customer', 140);
}

function resolveFulfilledAt(order = {}) {
  const candidates = [
    order.fulfilled_at,
    order.updated_at,
    order.closed_at,
    order.created_at,
  ].filter(Boolean);
  const date = candidates.length ? new Date(candidates[0]) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addDays(date, days) {
  const base = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return new Date(base.getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);
}

function makeOrderId(order = {}) {
  return cleanText(order.admin_graphql_api_id || order.id || order.order_id || order.name || `order-${Date.now()}`, 180);
}

function makeOrderDisplayName(order = {}) {
  return cleanText(order.name || order.order_number || order.id || '', 120);
}

function orderTags(order = {}) {
  const raw = Array.isArray(order.tags) ? order.tags.join(',') : String(order.tags || '');
  return raw.split(',').map((tag) => cleanText(tag, 80).toLowerCase()).filter(Boolean);
}

function hasRequiredDeliveryTag(order = {}, tag = 'delivered') {
  const wanted = cleanText(tag || 'delivered', 80).toLowerCase();
  return orderTags(order).includes(wanted);
}

async function scheduleReviewRequestFromOrder({ shopDomain, order = {}, source = 'shopify_webhook', delayDays, testMode = false, webhookId = '' }) {
  const cleanShop = cleanText(shopDomain, 200).toLowerCase();
  if (!cleanShop) throw new Error('Missing shop domain for review request scheduling.');

  const cfg = await getAutomationConfig(cleanShop);
  const effectiveDelay = delayDays === undefined || delayDays === null ? cfg.delayDays : clampNumber(delayDays, 0, 365, cfg.delayDays);
  const orderId = makeOrderId(order);
  const orderName = makeOrderDisplayName(order);
  const email = resolveOrderEmail(order);
  const customerName = resolveOrderName(order);
  const fulfilledAt = resolveFulfilledAt(order);
  const tags = orderTags(order);
  const delivered = !cfg.deliveryTagRequired || hasRequiredDeliveryTag(order, cfg.deliveryTag) || Boolean(testMode && order.delivered !== false);
  const deliveredAt = delivered ? new Date(order.delivered_at || order.updated_at || order.fulfilled_at || new Date()) : null;
  const anchorDate = cfg.deliveryAnchor === 'delivered_tag' && deliveredAt ? deliveredAt : fulfilledAt;
  const products = productsFromOrder(order);
  const scheduledAt = delivered ? addDays(anchorDate, effectiveDelay) : null;
  let status = email && products.length && cfg.enabled && cfg.nativeEnabled ? 'scheduled' : 'blocked';
  let blockedReason = '';
  if (!cfg.enabled || !cfg.nativeEnabled) blockedReason = 'Native review request automation is disabled.';
  else if (!email) blockedReason = 'Order has no customer email.';
  else if (!products.length) blockedReason = 'Order has no reviewable products.';
  else if (!delivered) {
    status = 'awaiting_delivery';
    blockedReason = `Waiting for Shopify order tag "${cfg.deliveryTag}" before starting the ${effectiveDelay}-day review timer.`;
  }

  const update = {
    shopDomain: cleanShop,
    source: cleanText(source, 80),
    orderId,
    orderName,
    customerEmail: email,
    customerName,
    products,
    fulfilledAt,
    deliveredAt,
    scheduledAt,
    delayDays: effectiveDelay,
    status,
    blockedReason,
    orderTags: tags,
    deliveryRequired: Boolean(cfg.deliveryTagRequired),
    requiredDeliveryTag: cfg.deliveryTag,
    testMode: Boolean(testMode),
    webhookId: cleanText(webhookId, 160),
    campaign: cfg.campaign || DEFAULT_CAMPAIGN,
  };

  return ReviewRequestJob.findOneAndUpdate(
    { shopDomain: cleanShop, orderId, customerEmail: email || `no-email:${orderId}` },
    { $set: update, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function updateReviewRequestDeliveryFromOrder({ shopDomain, order = {}, webhookId = '' }) {
  const cleanShop = cleanText(shopDomain, 200).toLowerCase();
  const cfg = await getAutomationConfig(cleanShop);
  const orderId = makeOrderId(order);
  const email = resolveOrderEmail(order);
  const tags = orderTags(order);
  const delivered = hasRequiredDeliveryTag(order, cfg.deliveryTag);
  const filter = email ? { shopDomain: cleanShop, orderId, customerEmail: email } : { shopDomain: cleanShop, orderId };
  if (!delivered) {
    await ReviewRequestJob.updateMany(filter, { $set: { orderTags: tags, webhookId: cleanText(webhookId, 160) } });
    return { ok: true, delivered: false, updated: 0, reason: `Order does not have tag "${cfg.deliveryTag}" yet.` };
  }
  const deliveredAt = new Date(order.delivered_at || order.updated_at || new Date());
  const scheduledAt = addDays(deliveredAt, cfg.delayDays);
  const result = await ReviewRequestJob.updateMany({ ...filter, status: 'awaiting_delivery' }, {
    $set: {
      status: 'scheduled',
      blockedReason: '',
      deliveredAt,
      scheduledAt,
      orderTags: tags,
      requiredDeliveryTag: cfg.deliveryTag,
      deliveryRequired: true,
      webhookId: cleanText(webhookId, 160),
    },
  });
  return { ok: true, delivered: true, updated: result.modifiedCount || 0, scheduledAt };
}


function reviewRequestHtml({ shopDomain, customerName, orderId, reviewUrl, products = [] }) {
  const productList = products.length
    ? `<ul style="text-align:left;margin:0 auto 20px;max-width:460px;color:#4b5563;">${products.slice(0, 6).map((product) => `<li>${product.title || 'Purchased product'}</li>`).join('')}</ul>`
    : '';
  const supportUrl = `${reviewUrl}${String(reviewUrl).includes('?') ? '&' : '?'}support=1`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#111827;background:#f3f4f6;padding:28px;"><div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:28px;text-align:center;"><p style="margin:0 0 8px;color:#667085;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:12px;">Review request</p><h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;">How was your recent order?</h1><p style="margin:0 0 16px;color:#4b5563;">Hi ${customerName || 'there'}, thanks for shopping with ${shopDomain}. Your order has had time to arrive, and we would love your feedback.</p><p style="margin:0 0 14px;color:#667085;font-size:13px;">Order: <strong>${orderId || 'recent order'}</strong></p>${productList}<a href="${reviewUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:12px;padding:13px 18px;">Leave a review</a><p style="margin:16px 0 0;color:#4b5563;font-size:14px;">Something wrong with delivery or your order?</p><a href="${supportUrl}" style="display:inline-block;margin-top:8px;color:#111827;text-decoration:underline;font-weight:bold;">Contact customer service before reviewing</a><p style="margin:22px 0 0;color:#98a2b3;font-size:12px;">This review link is unique to your order.</p></div></div>`;
}

function campaignUniqueKey({ shopDomain, campaign, token }) {
  return hashValue(`${shopDomain}:${campaign}:sent:${token}`);
}

async function sendReviewRequestJob(job) {
  const shopDomain = job.shopDomain;
  const settings = await EmailProviderSettings.findOne({ shopDomain });
  if (!settings || !settings.enabled || !settings.smtpPassEncrypted) {
    throw new Error('No active email provider with saved SMTP/app-password credentials is configured.');
  }

  const token = createReviewToken({
    shopDomain,
    email: job.customerEmail,
    customerName: job.customerName || 'Customer',
    orderId: job.orderId,
    orderName: job.orderName || '',
    orderDate: job.fulfilledAt || job.createdAt || '',
    products: job.products || [],
    expiresDays: 45,
    testMode: Boolean(job.testMode),
  });
  if (!token) throw new Error('Could not create a signed review token. Check EMAIL_CREDENTIAL_SECRET or SHOPIFY_API_SECRET.');

  const reviewUrl = `https://${shopDomain}/pages/leave-review?shopDomain=${encodeURIComponent(shopDomain)}&mode=order&order_id=${encodeURIComponent(job.orderId)}&email=${encodeURIComponent(job.customerEmail)}&token=${encodeURIComponent(token)}${job.testMode ? '&test=1' : ''}`;
  const fromEmail = settings.fromEmail || settings.smtpUser;
  const fromName = settings.fromName || 'Store Reviews';
  const cfg = await getAutomationConfig(shopDomain);
  const subject = cfg.subject || 'How was your recent order?';
  const html = reviewRequestHtml({ shopDomain, customerName: job.customerName, orderId: job.orderName || job.orderId, reviewUrl, products: job.products || [] });
  const htmlHash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);
  const transporter = createTransporterFromSettings(settings);

  await transporter.sendMail({
    from: `${String(fromName).replace(/"/g, '')} <${fromEmail}>`,
    to: job.customerEmail,
    replyTo: settings.replyToEmail || fromEmail,
    subject,
    html,
  });

  await CampaignEvent.create({
    shopDomain,
    campaign: job.campaign || cfg.campaign || DEFAULT_CAMPAIGN,
    eventType: 'sent',
    orderId: job.orderId,
    email: job.customerEmail,
    itemId: job.products?.[0]?.productId || job.products?.[0]?.id || '',
    token,
    subject,
    templateName: 'Native delayed review request',
    layoutName: 'native_scheduler',
    moduleNames: ['reviews', 'native_delay', `${cfg.delayDays}_day_delay`],
    htmlHash,
    uniqueKey: campaignUniqueKey({ shopDomain, campaign: job.campaign || cfg.campaign || DEFAULT_CAMPAIGN, token }),
  });

  job.status = 'sent';
  job.sentAt = new Date();
  job.reviewToken = token;
  job.reviewUrl = reviewUrl;
  job.errorMessage = '';
  job.attempts = Number(job.attempts || 0) + 1;
  job.lastAttemptAt = new Date();
  await job.save();
  return job;
}

async function sendDueReviewRequests({ limit = 25 } = {}) {
  const now = new Date();
  const jobs = await ReviewRequestJob.find({ status: 'scheduled', scheduledAt: { $lte: now } }).sort({ scheduledAt: 1 }).limit(limit);
  const results = [];
  for (const job of jobs) {
    try {
      job.status = 'sending';
      job.lastAttemptAt = new Date();
      await job.save();
      const sent = await sendReviewRequestJob(job);
      results.push({ id: String(sent._id), status: 'sent' });
    } catch (error) {
      job.status = Number(job.attempts || 0) >= 4 ? 'failed' : 'scheduled';
      job.attempts = Number(job.attempts || 0) + 1;
      job.errorMessage = error.message || 'Failed to send review request.';
      job.lastAttemptAt = new Date();
      job.scheduledAt = addDays(new Date(), job.status === 'failed' ? 0 : 1 / 24);
      await job.save().catch(() => {});
      results.push({ id: String(job._id), status: job.status, error: job.errorMessage });
    }
  }
  return { count: results.length, results };
}

async function registerReviewWebhookSubscriptions(shopDomain) {
  const appBase = env.appUrl || '';
  if (!appBase || !shopDomain) return { ok: false, skipped: true, reason: 'APP_URL or shop domain missing.' };
  const base = appBase.replace(/\/$/, '');
  const hooks = [
    { topic: 'orders/fulfilled', address: `${base}/api/webhooks/shopify/orders-fulfilled` },
    { topic: 'orders/updated', address: `${base}/api/webhooks/shopify/orders-updated` },
  ];
  const results = [];
  for (const hook of hooks) {
    const existing = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(hook.topic)}`, { shopDomain });
    const already = (existing?.webhooks || []).some((item) => String(item.address || '').replace(/\/$/, '') === hook.address);
    if (already) { results.push({ ok: true, already: true, ...hook }); continue; }
    const created = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/webhooks.json`, {
      shopDomain,
      method: 'POST',
      body: JSON.stringify({ webhook: { topic: hook.topic, address: hook.address, format: 'json' } }),
    });
    results.push(created?.webhook?.id ? { ok: true, ...hook, webhookId: String(created.webhook.id) } : { ok: false, ...hook, reason: 'Shopify did not confirm webhook creation. Check scopes/install.' });
  }
  const allOk = results.every((item) => item.ok);
  await Shop.findOneAndUpdate({ shopDomain }, { $set: { 'modules.reviews.webhookInstalledAt': allOk ? new Date() : null, 'modules.reviews.webhookTopics': results.map((r) => r.topic), 'modules.reviews.webhookAddresses': results.map((r) => r.address) } }).catch(() => {});
  return { ok: allOk, topics: results.map((r) => r.topic), results };
}


async function automationReadiness(shopDomain) {
  const [settings, emailSettings, shop, scheduledCount, sentCount, failedCount] = await Promise.all([
    Settings.findOne({ shopDomain }).lean(),
    EmailProviderSettings.findOne({ shopDomain }).lean(),
    Shop.findOne({ shopDomain }).lean(),
    ReviewRequestJob.countDocuments({ shopDomain, status: 'scheduled' }),
    ReviewRequestJob.countDocuments({ shopDomain, status: 'sent' }),
    ReviewRequestJob.countDocuments({ shopDomain, status: 'failed' }),
  ]);
  const cfg = reviewAutomationConfig(settings || {});
  const tokenReady = Boolean(env.emailCredentialSecret || env.shopifyApiSecret);
  const emailReady = Boolean(emailSettings?.enabled && emailSettings?.smtpPassEncrypted && (emailSettings?.fromEmail || emailSettings?.smtpUser));
  const oauthReady = Boolean(shop?.accessTokenEncrypted || env.shopifyAccessToken);
  const nativeReady = Boolean(cfg.enabled && cfg.nativeEnabled && tokenReady && emailReady);
  return {
    config: cfg,
    nativeReady,
    flowOptional: true,
    checks: [
      { key: 'native_scheduler', label: 'Nectar native scheduler', status: cfg.enabled && cfg.nativeEnabled ? 'ready' : 'blocked', detail: cfg.enabled && cfg.nativeEnabled ? `Native automation waits ${cfg.delayDays} days after ${cfg.deliveryTagRequired ? `Shopify order tag ${cfg.deliveryTag}` : 'fulfilment'}, then sends using Nectar email.` : 'Native automation is disabled.' },
      { key: 'delivery_tag_gate', label: 'Delivery tag gate', status: cfg.deliveryTagRequired ? 'ready' : 'warning', detail: cfg.deliveryTagRequired ? `Review emails wait until the Shopify order has tag ${cfg.deliveryTag}. Your tracking app can add this tag when delivered.` : 'Review emails use fulfilment date only. Enable the delivery tag gate to avoid reviews before delivery.' },
      { key: 'email_provider', label: 'Email provider', status: emailReady ? 'ready' : 'blocked', detail: emailReady ? `Emails send from ${emailSettings.fromEmail || emailSettings.smtpUser}.` : 'No active email provider is saved.' },
      { key: 'signed_links', label: 'Signed review links', status: tokenReady ? 'ready' : 'blocked', detail: tokenReady ? 'Review links can be signed and verified.' : 'Set EMAIL_CREDENTIAL_SECRET or SHOPIFY_API_SECRET.' },
      { key: 'shopify_oauth', label: 'Shopify OAuth / order webhook', status: oauthReady ? 'ready' : 'warning', detail: oauthReady ? 'The app can register Shopify webhooks for real fulfilled orders.' : 'OAuth is not connected. Fake-order tests still work, but live order webhooks will not.' },
    ],
    stats: { scheduledCount, sentCount, failedCount },
    shopWebhook: shop?.modules?.reviews || {},
  };
}

function startReviewRequestJobs() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const run = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      await sendDueReviewRequests({ limit: 25 });
    } catch (error) {
      console.warn('Review request scheduler skipped:', error.message);
    } finally {
      schedulerRunning = false;
    }
  };
  setTimeout(run, 20 * 1000);
  schedulerTimer = setInterval(run, 10 * 60 * 1000);
}

module.exports = {
  DEFAULT_DELAY_DAYS,
  reviewAutomationConfig,
  getAutomationConfig,
  scheduleReviewRequestFromOrder,
  updateReviewRequestDeliveryFromOrder,
  sendDueReviewRequests,
  registerReviewWebhookSubscriptions,
  automationReadiness,
  startReviewRequestJobs,
};
