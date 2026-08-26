const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { env } = require('../../config/env');
const { ReviewRequestJob, CampaignEvent, EmailProviderSettings, Settings, Shop, EmailTemplate } = require('../../models');
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

function friendlyShopDisplayName(shopDomain = '') {
  const host = String(shopDomain || '').replace(/\.myshopify\.com$/i, '').replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/[-_]+/g, ' ').trim();
  return host ? host.replace(/\b\w/g, (m) => m.toUpperCase()) : 'your store';
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


function escapeEmailHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clampTemplateNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function templateText(value = '', context = {}) {
  const customerName = context.customerName || 'there';
  const firstName = String(customerName).trim().split(/\s+/)[0] || 'there';
  return String(value || '')
    .replace(/\{\{\s*customerName\s*\}\}/gi, customerName)
    .replace(/\{\{\s*customerFirstName\s*\}\}/gi, firstName)
    // Backwards compatibility for templates previously authored with Shopify-Liquid-style variables.
    .replace(/\{\{\s*order\.customer\.firstName(?:\s*\|\s*default:\s*["'][^"']*["'])?\s*\}\}/gi, firstName)
    .replace(/\{\{\s*order\.customer\.first_name(?:\s*\|\s*default:\s*["'][^"']*["'])?\s*\}\}/gi, firstName)
    .replace(/\{\{\s*orderId\s*\}\}/gi, context.orderId || 'recent order')
    .replace(/\{\{\s*shopDomain\s*\}\}/gi, context.shopDomain || '')
    .replace(/\{\{\s*reviewUrl\s*\}\}/gi, context.reviewUrl || '');
}

function sectionHtml(section = {}, context = {}) {
  const title = templateText(section.title || section.name || '', context);
  const text = templateText(section.text || section.body || '', context);
  const buttonText = templateText(section.buttonText || '', context);
  let buttonUrl = templateText(section.buttonUrl || '', context);
  if (buttonUrl === '{{support_link}}') buttonUrl = `${context.reviewUrl || ''}${String(context.reviewUrl || '').includes('?') ? '&' : '?'}support=1`;
  const bg = section.bgColor || section.background || section.bg || 'transparent';
  const border = section.borderColor || section.border || '#e5e7eb';
  const radius = clampTemplateNumber(section.radius, 14, 0, 40);
  const padding = clampTemplateNumber(section.padding, 16, 4, 40);
  const borderWidth = clampTemplateNumber(section.borderWidth ?? section.borderPx, 1, 0, 8);
  const widthPct = clampTemplateNumber(Math.round(Number(section.widthPct || 100) / 20) * 20, 100, 20, 100);
  const heightPct = clampTemplateNumber(Math.round(Number(section.heightPct || 5) / 5) * 5, 5, 5, 40);
  const minHeight = Math.max(0, heightPct * 4);
  if (!title && !text && !buttonText) return '';
  return `<tr><td style="padding:12px 0 0 0;text-align:left;"><table role="presentation" width="${widthPct}%" cellspacing="0" cellpadding="0" border="0" style="width:${widthPct}%;max-width:100%;"><tr><td style="text-align:left;background:${escapeEmailHtml(bg)};border:${borderWidth}px solid ${escapeEmailHtml(border)};border-radius:${radius}px;padding:${padding}px;color:#111827;min-height:${minHeight}px;">${title ? `<strong style="display:block;margin:0 0 6px;font-size:15px;">${escapeEmailHtml(title)}</strong>` : ''}${text ? `<p style="margin:0;color:#4b5563;font-size:14px;line-height:1.5;">${escapeEmailHtml(text)}</p>` : ''}${buttonText ? `<a href="${escapeEmailHtml(buttonUrl || context.reviewUrl || '#')}" style="display:inline-block;margin-top:10px;color:#111827;font-weight:bold;text-decoration:underline;">${escapeEmailHtml(buttonText)}</a>` : ''}</td></tr></table></td></tr>`;
}

async function findPrimaryReviewTemplate(shopDomain) {
  return EmailTemplate.findOne({ shopDomain, area: 'reviews', kind: 'review_request', enabled: true, isPrimary: true }).lean().catch(() => null);
}

function renderTemplateReviewEmail({ template, shopDomain, shopName, customerName, orderId, reviewUrl, products = [] }) {
  const design = template?.design || {};
  const context = { shopDomain, customerName: customerName || 'there', orderId: orderId || 'recent order', reviewUrl };
  const bgColor = design.bgColor || '#f3f4f6';
  const cardColor = design.cardColor || '#ffffff';
  const accentColor = design.accentColor || '#111827';
  const buttonRadius = clampTemplateNumber(design.buttonRadius, 10, 0, 40);
  const heading = templateText(design.heading || 'How was your recent order?', context);
  const headingAlign = ['left', 'center', 'right'].includes(design.headingAlign) ? design.headingAlign : 'center';
  const headingWeight = ['300', '400', '600', '700', '800'].includes(String(design.headingWeight || '')) ? String(design.headingWeight) : '700';
  const headingFont = design.headingFont || 'Arial,Helvetica,sans-serif';
  const introAlign = ['left', 'center', 'right'].includes(design.introAlign) ? design.introAlign : 'center';
  const bodyAlign = ['left', 'center', 'right'].includes(design.bodyAlign) ? design.bodyAlign : 'center';
  const intro = templateText(design.intro || 'Hi {{ customerName }}', context);
  const body = templateText(design.body || 'We hope you are loving your recent purchase. Could you take 60 seconds to leave a quick review?', context);
  const signoff = templateText(design.signoff || 'Your feedback helps other customers make confident choices.', context);
  const mainButtonText = design.mainButtonText || 'Review Your Order';
  const productButtonText = design.productButtonText || 'Review This Item';
  const starColor = design.starColor || '#f5b301';
  const showTopStars = design.showTopStars !== false;
  const productShowStars = design.productShowStars !== false;
  const productStarPosition = ['above_button', 'between', 'under_title', 'custom'].includes(design.productStarPosition) ? design.productStarPosition : 'above_button';
  const productTitleWeight = ['400', '600', '700', '800'].includes(String(design.productTitleWeight || '')) ? String(design.productTitleWeight) : '700';
  const productShowId = design.productShowId !== false;
  const productImageSize = clampTemplateNumber(design.productImageSize, 58, 36, 120);
  const productRowAlign = ['left', 'compact', 'stacked'].includes(design.productRowAlign) ? design.productRowAlign : 'left';
  const allowedOrder = ['image', 'title', 'id', 'stars', 'button'];
  const productElementOrder = (Array.isArray(design.productElementOrder) ? design.productElementOrder : String(design.productElementOrder || 'image,title,id,stars,button').split(','))
    .map((item) => String(item || '').trim())
    .filter((item) => allowedOrder.includes(item));
  const normaliseProductLayoutZones = (raw = {}) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const clean = { left: [], middle: [], right: [], hidden: [] };
    ['left', 'middle', 'right', 'hidden'].forEach((zone) => {
      (Array.isArray(source[zone]) ? source[zone] : []).forEach((item) => {
        const key = String(item || '').trim();
        if (allowedOrder.includes(key) && !Object.values(clean).some((items) => items.includes(key))) clean[zone].push(key);
      });
    });
    allowedOrder.forEach((key) => { if (!Object.values(clean).some((items) => items.includes(key))) clean.hidden.push(key); });
    return clean;
  };
  const productLayoutZones = normaliseProductLayoutZones(design.productLayoutZones || { left: productElementOrder.includes('image') ? ['image'] : [], middle: productElementOrder.filter((id) => !['image', 'button'].includes(id)), right: productElementOrder.includes('button') ? ['button'] : [], hidden: allowedOrder.filter((id) => !productElementOrder.includes(id)) });
  const linkMode = ['order', 'products', 'both'].includes(design.linkMode) ? design.linkMode : 'both';
  const logo = design.logo || '';
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  const beforeSections = sections.filter((s) => (s.position || 'after') === 'before').map((section) => sectionHtml(section, context)).join('');
  const afterSections = sections.filter((s) => (s.position || 'after') !== 'before').map((section) => sectionHtml(section, context)).join('');
  const logoHtml = logo ? `<tr><td align="center" style="padding:0 0 18px 0;"><img src="${escapeEmailHtml(logo)}" alt="" style="max-width:160px;height:auto;display:block;"></td></tr>` : '';
  const orderButton = `<tr><td align="center" style="padding:18px 0 14px 0;"><a href="${escapeEmailHtml(reviewUrl)}" style="display:inline-block;background:${escapeEmailHtml(accentColor)};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 24px;border-radius:${buttonRadius}px;">${escapeEmailHtml(mainButtonText)}</a></td></tr>`;
  const starHtml = `<div style="margin:6px 0;color:${escapeEmailHtml(starColor)};font-size:18px;letter-spacing:2px;line-height:1;">★★★★★</div>`;
  const productRowHtml = (product = {}) => {
    const titleHtml = `<div style="font-family:${escapeEmailHtml(headingFont)};color:#111827;font-size:14px;font-weight:${escapeEmailHtml(productTitleWeight)};line-height:1.35;">${escapeEmailHtml(product.title || 'Purchased product')}</div>`;
    const idHtml = productShowId ? `<div style="font-size:12px;color:#667085;font-weight:normal;margin-top:3px;">Product ID: ${escapeEmailHtml(product.productId || product.id || '')}</div>` : '';
    const imgHtml = product.image ? `<img src="${escapeEmailHtml(product.image)}" width="${productImageSize}" height="${productImageSize}" alt="" style="display:block;width:${productImageSize}px;height:${productImageSize}px;object-fit:cover;border-radius:10px;background:#eef2f7;border:0;">` : `<div style="width:${productImageSize}px;height:${productImageSize}px;border-radius:10px;background:#eef2f7;"></div>`;
    const buttonHtml = `<a href="${escapeEmailHtml(reviewUrl)}" style="display:inline-block;background:${escapeEmailHtml(accentColor)};color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:9px 13px;border-radius:${buttonRadius}px;white-space:nowrap;">${escapeEmailHtml(productButtonText)}</a>`;
    const map = { image: imgHtml, title: titleHtml, id: idHtml, stars: productShowStars ? starHtml : '', button: buttonHtml };
    const allowedVisible = (key) => (key !== 'id' || productShowId) && (key !== 'stars' || productShowStars) && map[key];
    const renderPieces = (items = [], align = 'left') => items.filter(allowedVisible).map((key) => `<div style="margin:4px 0;text-align:${align};">${map[key]}</div>`).join('');
    const align = productRowAlign === 'compact' || productRowAlign === 'stacked' ? 'center' : 'left';
    if (productStarPosition === 'custom') {
      const zones = productLayoutZones;
      const left = zones.left.filter(allowedVisible);
      const middle = zones.middle.filter(allowedVisible);
      const right = zones.right.filter(allowedVisible);
      const active = [...left, ...middle, ...right];
      if (active.length) {
        if (productRowAlign === 'stacked') {
          return `<tr><td style="padding:14px 0;border-top:1px solid #e5e7eb;text-align:center;">${renderPieces(active, 'center')}</td></tr>`;
        }
        const leftHtml = renderPieces(left, 'left');
        const middleHtml = renderPieces(middle, align);
        const rightHtml = renderPieces(right, 'right');
        const cols = [];
        if (leftHtml) cols.push(`<td style="vertical-align:middle;text-align:left;padding-right:12px;width:${left.includes('image') ? productImageSize + 12 : 120}px;">${leftHtml}</td>`);
        if (middleHtml) cols.push(`<td style="vertical-align:middle;text-align:${align};padding:0 10px;">${middleHtml}</td>`);
        if (rightHtml) cols.push(`<td style="vertical-align:middle;text-align:right;padding-left:12px;width:140px;">${rightHtml}</td>`);
        return `<tr><td style="padding:12px 0;border-top:1px solid #e5e7eb;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${cols.join('')}</tr></table></td></tr>`;
      }
    }
    let order = productElementOrder.slice();
    if (productStarPosition !== 'custom') {
      order = ['image', 'title'];
      if (productShowId) order.push('id');
      if (productShowStars) {
        if (productStarPosition === 'under_title' || productStarPosition === 'between' || productStarPosition === 'above_button') order.push('stars');
      }
      order.push('button');
    }
    const visible = order.filter(allowedVisible);
    const content = visible.filter((key) => key !== 'image').map((key) => `<div style="margin:4px 0;">${map[key]}</div>`).join('');
    const imageFirst = visible[0] === 'image';
    if (productRowAlign === 'stacked' || !imageFirst) {
      const imageBlock = visible.includes('image') ? `<div style="margin:0 0 10px 0;">${imgHtml}</div>` : '';
      return `<tr><td style="padding:14px 0;border-top:1px solid #e5e7eb;text-align:${align};">${imageBlock}${content}</td></tr>`;
    }
    return `<tr><td style="padding:12px 0;border-top:1px solid #e5e7eb;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="${productImageSize}" style="padding-right:12px;vertical-align:middle;">${imgHtml}</td><td style="vertical-align:middle;text-align:${align};">${content}</td></tr></table></td></tr>`;
  };
  const productRows = products.length ? `<tr><td style="padding:18px 0 0 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${products.slice(0, 12).map(productRowHtml).join('')}</table></td></tr>` : '';
  const topStars = showTopStars ? `<tr><td align="center" style="padding:0 0 12px 0;"><span style="display:inline-block;color:${escapeEmailHtml(starColor)};font-size:18px;letter-spacing:2px;line-height:1;white-space:nowrap;">★★★★★</span></td></tr>` : '';
  const links = linkMode === 'order' ? orderButton + topStars : linkMode === 'products' ? topStars + (productRows || orderButton) : orderButton + topStars + productRows;
  return `<div style="font-family:${escapeEmailHtml(headingFont)};line-height:1.55;color:#111827;background:${escapeEmailHtml(bgColor)};padding:28px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:${escapeEmailHtml(cardColor)};border:1px solid #e5e7eb;border-radius:18px;padding:28px;text-align:center;"><tr><td>${logoHtml}<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;text-align:${escapeEmailHtml(headingAlign)};font-weight:${escapeEmailHtml(headingWeight)};font-family:${escapeEmailHtml(headingFont)};">${escapeEmailHtml(heading)}</h1><p style="margin:0 0 10px;color:#4b5563;text-align:${escapeEmailHtml(introAlign)};">${escapeEmailHtml(intro)}</p><p style="margin:0 0 16px;color:#4b5563;text-align:${escapeEmailHtml(bodyAlign)};">${escapeEmailHtml(body)}</p><p style="margin:0 0 14px;color:#667085;font-size:13px;">Order: <strong>${escapeEmailHtml(orderId || 'recent order')}</strong></p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${beforeSections}${links}${afterSections}</table><p style="margin:22px 0 0;color:#667085;font-size:13px;">${escapeEmailHtml(signoff)}</p><p style="margin:18px 0 0;color:#98a2b3;font-size:12px;">Sent by ${escapeEmailHtml(shopName || friendlyShopDisplayName(shopDomain))}. This review link is unique to your order.</p></td></tr></table></td></tr></table></div>`;
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
  const primaryTemplate = await findPrimaryReviewTemplate(shopDomain);
  const subject = primaryTemplate?.subject || cfg.subject || 'How was your recent order?';
  const html = primaryTemplate
    ? renderTemplateReviewEmail({ template: primaryTemplate, shopDomain, shopName: settings.fromName || friendlyShopDisplayName(shopDomain), customerName: job.customerName, orderId: job.orderName || job.orderId, reviewUrl, products: job.products || [] })
    : reviewRequestHtml({ shopDomain, customerName: job.customerName, orderId: job.orderName || job.orderId, reviewUrl, products: job.products || [] });
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

async function sendDueReviewRequests({ limit = 25, jobId = '' } = {}) {
  const now = new Date();
  const filter = jobId ? { _id: jobId } : { status: 'scheduled', scheduledAt: { $lte: now } };
  const jobs = await ReviewRequestJob.find(filter).sort({ scheduledAt: 1 }).limit(limit);
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

function reviewWebhookDefinitions() {
  const appBase = env.appUrl || '';
  const base = appBase.replace(/\/$/, '');
  return [
    {
      key: 'orders_fulfilled',
      name: 'Order fulfillment',
      topic: 'orders/fulfilled',
      address: `${base}/api/webhooks/shopify/orders-fulfilled`,
      endpoint: '/api/webhooks/shopify/orders-fulfilled',
      format: 'json',
      apiVersion: env.shopifyApiVersion,
      purpose: 'Creates the private review-request job when Shopify marks an order as fulfilled.',
      customerJourneyStep: 'Order fulfilled → Nectar receives the event → review request job is created.',
      requiredForLaunch: true,
    },
    {
      key: 'orders_updated',
      name: 'Order update',
      topic: 'orders/updated',
      address: `${base}/api/webhooks/shopify/orders-updated`,
      endpoint: '/api/webhooks/shopify/orders-updated',
      format: 'json',
      apiVersion: env.shopifyApiVersion,
      purpose: 'Re-checks delivery tags/status changes so the review timer can start when the order is actually delivered.',
      customerJourneyStep: 'Order receives the delivered tag/status update → Nectar releases the job into the 14-day timer.',
      requiredForLaunch: true,
    },
  ];
}

function expectedReviewWebhookSubscriptions() {
  return reviewWebhookDefinitions().map(({ topic, address }) => ({ topic, address }));
}

function safeWebhookActual(item = {}) {
  if (!item) return null;
  return {
    id: String(item.id || ''),
    topic: String(item.topic || ''),
    address: String(item.address || ''),
    format: String(item.format || ''),
    apiVersion: String(item.api_version || item.apiVersion || ''),
    createdAt: item.created_at || item.createdAt || null,
    updatedAt: item.updated_at || item.updatedAt || null,
  };
}

async function inspectReviewWebhookSubscriptions(shopDomain) {
  const hooks = reviewWebhookDefinitions();
  if (!env.appUrl || !shopDomain) {
    return { ok: false, skipped: true, reason: 'APP_URL or shop domain missing.', hooks, results: [] };
  }

  const results = [];
  for (const hook of hooks) {
    const existing = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(hook.topic)}`, { shopDomain });
    if (!existing) {
      results.push({
        ok: false,
        unknown: true,
        ...hook,
        reason: 'Could not read Shopify runtime webhooks. If these are defined in shopify.app.toml, deploy the app configuration and use the manual/config-file finalise action.',
      });
      continue;
    }
    const matching = (existing.webhooks || []).find((item) => String(item.address || '').replace(/\/$/, '') === hook.address);
    const sameTopic = existing.webhooks || [];
    results.push(matching ? {
      ok: true,
      already: true,
      verifiedInShopify: true,
      ...hook,
      webhookId: String(matching.id || ''),
      actual: safeWebhookActual(matching),
      matchingTopicCount: sameTopic.length,
    } : {
      ok: false,
      missing: true,
      verifiedInShopify: false,
      ...hook,
      reason: 'Expected webhook was not found in Shopify Admin.',
      actual: null,
      matchingTopicCount: sameTopic.length,
      otherAddressesForTopic: sameTopic.map((item) => safeWebhookActual(item)).filter(Boolean),
    });
  }
  return { ok: results.every((item) => item.ok), hooks, results, checkedAt: new Date() };
}

async function registerReviewWebhookSubscriptions(shopDomain) {
  const appBase = env.appUrl || '';
  if (!appBase || !shopDomain) return { ok: false, skipped: true, reason: 'APP_URL or shop domain missing.' };
  const hooks = reviewWebhookDefinitions();
  const results = [];
  for (const hook of hooks) {
    const existing = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/webhooks.json?topic=${encodeURIComponent(hook.topic)}`, { shopDomain });
    const alreadyMatch = (existing?.webhooks || []).find((item) => String(item.address || '').replace(/\/$/, '') === hook.address);
    if (alreadyMatch) {
      results.push({ ok: true, already: true, verifiedInShopify: true, ...hook, webhookId: String(alreadyMatch.id || ''), actual: safeWebhookActual(alreadyMatch) });
      continue;
    }
    const created = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/webhooks.json`, {
      shopDomain,
      method: 'POST',
      body: JSON.stringify({ webhook: { topic: hook.topic, address: hook.address, format: 'json' } }),
    });
    results.push(created?.webhook?.id ? {
      ok: true,
      verifiedInShopify: true,
      ...hook,
      webhookId: String(created.webhook.id),
      actual: safeWebhookActual(created.webhook),
    } : {
      ok: false,
      verifiedInShopify: false,
      ...hook,
      reason: 'Shopify did not confirm webhook creation. Check the app install token, order scopes, APP_URL and Render logs. If using shopify.app.toml, deploy the Shopify app configuration instead.',
    });
  }
  const allOk = results.every((item) => item.ok);
  await Shop.findOneAndUpdate({ shopDomain }, {
    $set: {
      'modules.reviews.enabled': true,
      'modules.reviews.webhookInstalledAt': allOk ? new Date() : null,
      'modules.reviews.webhookSource': allOk ? 'shopify_api_registration' : 'shopify_api_registration_failed',
      'modules.reviews.webhookMode': 'automatic',
      'modules.reviews.webhookTopics': results.map((r) => r.topic),
      'modules.reviews.webhookAddresses': results.map((r) => r.address),
      'modules.reviews.webhookAddress': results.find((r) => r.topic === 'orders/fulfilled')?.address || hooks[0].address,
      'modules.reviews.webhookTopic': 'orders/fulfilled',
      'modules.reviews.webhookVerificationStatus': allOk ? 'verified' : 'failed',
      'modules.reviews.webhookVerificationCheckedAt': new Date(),
      'modules.reviews.webhookRegistrationResults': results,
      'modules.reviews.webhookInspectionResults': results,
      'modules.reviews.manualSetupFinalised': false,
    },
    $setOnInsert: { shopDomain },
  }, { upsert: true, setDefaultsOnInsert: true }).catch(() => {});
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
  expectedReviewWebhookSubscriptions,
  inspectReviewWebhookSubscriptions,
  registerReviewWebhookSubscriptions,
  automationReadiness,
  startReviewRequestJobs,
};
