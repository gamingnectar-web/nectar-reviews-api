const express = require('express');
const { env } = require('../config/env');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { Review, Settings, CampaignEvent, EmailProviderSettings, EmailProviderProfile, EmailTemplate, Shop, E2ETestRun, ReviewRequestJob } = require('../models');
const { requireAdminSession } = require('../utils/security');
const { cleanText, cleanEmail, clampNumber, cleanReviewStatus } = require('../utils/validation');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const { publicEmailSettings } = require('../utils/emailSettings');
const { shopifyFetch, shopifyFetchOptional, getAccessTokenForShop, buildInstallUrl } = require('../utils/shopify');
const { createReviewToken } = require('../utils/reviewTokens');
const { scheduleReviewRequestFromOrder, sendDueReviewRequests, automationReadiness, registerReviewWebhookSubscriptions, inspectReviewWebhookSubscriptions, expectedReviewWebhookSubscriptions } = require('../modules/reviews/reviewRequestAutomation');
const { awardForReview, getOrCreateLoyaltyProgram, normaliseCustomerRef, customerHintFromHash, createLedgerEntry } = require('../modules/loyalty/loyalty.service');
const { getOrCreateDiscountProgram, issueDiscountCode } = require('../modules/discounts/discounts.service');

const router = express.Router();

router.use(requireAdminSession);

function shopDomainFromReq(req) {
  return req.shopDomain;
}


function looksLikeShopifyProductId(value) {
  const v = String(value || '').trim();
  return /^(gid:\/\/shopify\/Product\/\d+|\d{6,})$/.test(v);
}

async function ensureShop(shopDomain) {
  return Shop.findOneAndUpdate(
    { shopDomain },
    {
      $setOnInsert: {
        shopDomain,
        installedAt: new Date(),
        modules: {
          reviews: { enabled: true },
          discounts: { enabled: false },
          loyalty: { enabled: false },
          referrals: { enabled: false },
          productCreationImport: { enabled: true },
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}


function defaultReviewWidgets() {
  return [
    { key: 'reviews_widget', name: 'Reviews Widget', status: 'live', enabled: true, placement: 'product_page', description: 'Full customer review section for product pages.', renderSnippet: "{% render 'bulk_review_page', product: product %}" },
    { key: 'star_rating', name: 'Star Rating', status: 'live', enabled: true, placement: 'product_card', description: 'Compact rating stars for product and collection cards.', renderSnippet: "{% render 'product_card_stars', product: product %}" },
    { key: 'reviews_carousel', name: 'Reviews Carousel', status: 'live', enabled: false, placement: 'homepage', description: 'Global carousel of accepted reviews for landing pages.', renderSnippet: "{% render 'carousel' %}" },
    { key: 'seo_reviews_page', name: 'All Reviews SEO Page', status: 'live', enabled: false, placement: 'Dedicated reviews page', description: 'Searchable approved reviews page for customers, SEO and AI discovery.', renderSnippet: "{% render 'all_reviews_seo_page' %}" },
    { key: 'reviews_tab', name: 'Reviews Tab', status: 'draft', enabled: false, placement: 'floating_tab', description: 'Floating review tab for store-wide social proof.', renderSnippet: "<div data-nectar-review-tab></div>" },
    { key: 'review_highlights', name: 'Review Highlights', status: 'coming_soon', enabled: false, placement: 'product_page', description: 'AI-style summary snippets and review themes. Planned for a later release.', renderSnippet: '' },
    { key: 'qa_widget', name: 'Q&A Widget', status: 'coming_soon', enabled: false, placement: 'product_page', description: 'Product questions and answers. Planned but not active yet.', renderSnippet: '' },
  ];
}

function mergeReviewWidgets(saved = []) {
  const defaults = defaultReviewWidgets();
  const savedMap = new Map((Array.isArray(saved) ? saved : []).map((item) => [item.key, item]));
  return defaults.map((item) => ({ ...item, ...(savedMap.get(item.key) || {}) }));
}

function publicMigrationSettings(settings = {}) {
  const mode = settings?.migrationMode || {};
  return {
    enabled: Boolean(mode.enabled),
    sourcePlatform: mode.sourcePlatform || 'yotpo',
    yotpoStillLive: mode.yotpoStillLive !== false,
    nectarWidgetsEnabled: Boolean(mode.nectarWidgetsEnabled),
    nectarEmailsEnabled: Boolean(mode.nectarEmailsEnabled),
    duplicateSchemaProtection: mode.duplicateSchemaProtection !== false,
    importOnlyPublished: mode.importOnlyPublished !== false,
    importVerifiedWhenAvailable: mode.importVerifiedWhenAvailable !== false,
    lastCheckedAt: mode.lastCheckedAt || null,
    notes: mode.notes || '',
  };
}


function publicProviderProfile(profile) {
  if (!profile) return null;
  return {
    _id: String(profile._id),
    name: profile.name || 'Email provider',
    enabled: Boolean(profile.enabled),
    provider: profile.provider || 'smtp',
    smtpHost: profile.smtpHost || '',
    smtpPort: profile.smtpPort || '',
    secureMode: profile.secureMode || 'starttls',
    smtpUser: profile.smtpUser || '',
    smtpPasswordSet: Boolean(profile.smtpPassEncrypted),
    fromName: profile.fromName || '',
    fromEmail: profile.fromEmail || '',
    replyToEmail: profile.replyToEmail || '',
    primaryFor: Array.isArray(profile.primaryFor) ? profile.primaryFor : [],
    lastUsedAt: profile.lastUsedAt || null,
    lastTestedAt: profile.lastTestedAt || null,
    lastTestStatus: profile.lastTestStatus || '',
    lastTestError: profile.lastTestError || '',
  };
}


function publicEmailTemplate(template) {
  if (!template) return null;
  return {
    _id: String(template._id),
    name: template.name || 'Review request template',
    area: template.area || 'reviews',
    kind: template.kind || 'review_request',
    enabled: template.enabled !== false,
    isPrimary: Boolean(template.isPrimary),
    subject: template.subject || 'How was your recent order?',
    previewText: template.previewText || '',
    design: template.design || {},
    sections: Array.isArray(template.sections) ? template.sections : [],
    notes: template.notes || '',
    lastUsedAt: template.lastUsedAt || null,
    updatedAt: template.updatedAt || null,
    createdAt: template.createdAt || null,
  };
}

function cleanTemplateArea(value = 'reviews') {
  return ['reviews', 'loyalty', 'cartRewards', 'general'].includes(value) ? value : 'reviews';
}

function cleanTemplateKind(value = 'review_request') {
  return ['review_request', 'manual_reminder', 'general', 'product_card_layout'].includes(value) ? value : 'review_request';
}

function cleanTemplateDesign(raw = {}) {
  const design = raw && typeof raw === 'object' ? raw : {};
  return {
    logo: cleanText(design.logo || '', 1000),
    accentColor: cleanText(design.accentColor || '#111827', 40),
    buttonRadius: clampNumber(design.buttonRadius, 0, 40, 8),
    bgColor: cleanText(design.bgColor || '#f3f4f6', 40),
    cardColor: cleanText(design.cardColor || '#ffffff', 40),
    heading: cleanText(design.heading || 'How did we do?', 180),
    headingAlign: ['left', 'center', 'right'].includes(design.headingAlign) ? design.headingAlign : 'center',
    headingWeight: ['300', '400', '600', '700', '800'].includes(String(design.headingWeight || '')) ? String(design.headingWeight) : '700',
    headingFont: cleanText(design.headingFont || 'Arial,Helvetica,sans-serif', 220),
    introAlign: ['left', 'center', 'right'].includes(design.introAlign) ? design.introAlign : 'center',
    bodyAlign: ['left', 'center', 'right'].includes(design.bodyAlign) ? design.bodyAlign : 'center',
    customFonts: (Array.isArray(design.customFonts) ? design.customFonts : []).map((font) => ({ name: cleanText(font.name || '', 120), url: cleanText(font.url || '', 1000) })).filter((font) => font.name || font.url).slice(0, 50),
    intro: cleanText(design.intro || 'Hi {{ customerName }}', 240),
    body: cleanText(design.body || '', 1000),
    signoff: cleanText(design.signoff || '', 260),
    linkMode: ['both', 'order', 'products'].includes(design.linkMode) ? design.linkMode : 'both',
    mainButtonText: cleanText(design.mainButtonText || 'Review Your Order', 80),
    productButtonText: cleanText(design.productButtonText || 'Review This Item', 80),
    layoutPreset: cleanText(design.layoutPreset || 'classic', 60),
    starColor: cleanText(design.starColor || '#f5b301', 40),
    showTopStars: design.showTopStars !== false,
    pageHandle: cleanText(design.pageHandle || 'leave-review', 120),
    productShowStars: design.productShowStars !== false,
    productStarPosition: ['above_button', 'between', 'under_title', 'custom'].includes(design.productStarPosition) ? design.productStarPosition : 'above_button',
    productTitleWeight: ['400', '600', '700', '800'].includes(String(design.productTitleWeight || '')) ? String(design.productTitleWeight) : '700',
    productShowId: design.productShowId !== false,
    productImageSize: clampNumber(design.productImageSize, 36, 120, 58),
    productRowAlign: ['left', 'compact', 'stacked'].includes(design.productRowAlign) ? design.productRowAlign : 'left',
    productElementOrder: (Array.isArray(design.productElementOrder) ? design.productElementOrder : String(design.productElementOrder || 'image,title,id,stars,button').split(',')).map((item) => cleanText(item, 30)).filter((item) => ['image','title','id','stars','button'].includes(item)).slice(0, 8),
    productLayoutZones: (() => {
      const allowed = ['image', 'title', 'id', 'stars', 'button'];
      const source = design.productLayoutZones && typeof design.productLayoutZones === 'object' ? design.productLayoutZones : {};
      const clean = { left: [], middle: [], right: [], hidden: [] };
      ['left', 'middle', 'right', 'hidden'].forEach((zone) => {
        (Array.isArray(source[zone]) ? source[zone] : []).forEach((item) => {
          const key = cleanText(item, 30);
          if (allowed.includes(key) && !Object.values(clean).some((items) => items.includes(key))) clean[zone].push(key);
        });
      });
      allowed.forEach((key) => { if (!Object.values(clean).some((items) => items.includes(key))) clean.hidden.push(key); });
      return clean;
    })(),
    delayDays: clampNumber(design.delayDays, 0, 365, 14),
  };
}


function cleanFontOverrides(value = []) {
  return (Array.isArray(value) ? value : [])
    .map((font) => ({
      name: cleanText(font.name || '', 120),
      url: cleanText(font.url || '', 1000),
    }))
    .filter((font) => font.name && /^https:\/\/fonts\.googleapis\.com\//i.test(font.url))
    .slice(0, 50);
}

function cleanTemplateSections(value = []) {
  return (Array.isArray(value) ? value : [])
    .map((section) => ({
      id: cleanText(section.id || `section-${Date.now()}`, 80),
      type: cleanText(section.type || 'notice', 80),
      position: ['before', 'after'].includes(section.position) ? section.position : 'after',
      title: cleanText(section.title || section.name || '', 180),
      text: cleanText(section.text || section.body || '', 1000),
      background: cleanText(section.background || section.bg || 'transparent', 40),
      border: cleanText(section.border || '#e5e7eb', 40),
      radius: clampNumber(section.radius, 0, 60, 14),
      padding: clampNumber(section.padding, 0, 60, 16),
      borderWidth: clampNumber(section.borderWidth ?? section.borderPx, 0, 8, 1),
      buttonText: cleanText(section.buttonText || '', 120),
      buttonUrl: cleanText(section.buttonUrl || '', 1000),
    }))
    .filter((section) => section.title || section.text || section.buttonText)
    .slice(0, 20);
}

function providerUpdateFromBody(body = {}, existing = null) {
  if (!body.provider || body.provider === 'none') throw new Error('Choose a provider.');
  if (!body.smtpHost || !body.smtpUser || !body.fromEmail) throw new Error('SMTP host, username, and from email are required.');
  const smtpHostError = assertValidSmtpHost(body.smtpHost);
  if (smtpHostError) throw new Error(smtpHostError);
  if (!body.smtpPass && !existing?.smtpPassEncrypted) throw new Error('SMTP password/app password is required the first time you save.');
  const update = {
    enabled: body.enabled !== false,
    provider: cleanText(body.provider, 60),
    smtpHost: cleanText(body.smtpHost, 200),
    smtpPort: clampNumber(body.smtpPort, 1, 65535, 587),
    secureMode: ['starttls', 'ssl', 'none'].includes(body.secureMode) ? body.secureMode : 'starttls',
    smtpUser: cleanText(body.smtpUser, 254),
    fromName: cleanText(body.fromName, 120),
    fromEmail: cleanEmail(body.fromEmail),
    replyToEmail: cleanEmail(body.replyToEmail),
  };
  if (body.smtpPass) update.smtpPassEncrypted = encryptSecret(body.smtpPass);
  return update;
}

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

async function activeEmailSettings(shopDomain) {
  const settings = await EmailProviderSettings.findOne({ shopDomain });
  if (!settings || !settings.enabled || !settings.smtpPassEncrypted) {
    const error = new Error('Email provider is not configured for this shop.');
    error.statusCode = 400;
    throw error;
  }
  return settings;
}

function lockedReviewProofRecipient(emailSettings, settings) {
  return cleanEmail(
    emailSettings?.replyToEmail
    || emailSettings?.fromEmail
    || emailSettings?.smtpUser
    || settings?.supportSettings?.supportEmail
    || ''
  );
}

function sourceJobToProofOrder(sourceJob, proofEmail) {
  const sourceOrder = sourceJob?.orderName || sourceJob?.orderId || 'ORDER';
  const proofStamp = Date.now().toString().slice(-8);
  const products = Array.isArray(sourceJob?.products) && sourceJob.products.length
    ? sourceJob.products.slice(0, 20).map((product, index) => ({
      id: cleanText(product.id || product.productId || product.handle || product.title || `proof-product-${index + 1}`, 180),
      title: cleanText(product.title || 'Purchased product', 200),
      handle: cleanText(product.handle || '', 200),
      quantity: clampNumber(product.quantity || 1, 1, 999, 1),
    }))
    : [{ id: 'proof-product', title: 'Review proof product', quantity: 1 }];
  return {
    id: `NECTAR-PROOF-${proofStamp}-${String(sourceJob?._id || sourceOrder).slice(-6)}`,
    name: `PROOF-${sourceOrder}`,
    email: proofEmail,
    contact_email: proofEmail,
    customer: { first_name: 'Shop', last_name: 'Proof', email: proofEmail },
    fulfilled_at: new Date().toISOString(),
    tags: 'delivered, nectar-proof',
    line_items: products,
    delivered: true,
  };
}

async function sendReviewProofForSourceJob({ shopDomain, sourceJob }) {
  const [emailSettings, settings] = await Promise.all([
    activeEmailSettings(shopDomain),
    Settings.findOne({ shopDomain }).lean(),
  ]);
  const proofRecipient = lockedReviewProofRecipient(emailSettings, settings);
  if (!proofRecipient) {
    const error = new Error('No locked shop email is available. Save a Reviews email sender or support email first.');
    error.statusCode = 400;
    throw error;
  }
  const proofOrder = sourceJobToProofOrder(sourceJob, proofRecipient);
  const proofJob = await scheduleReviewRequestFromOrder({
    shopDomain,
    order: proofOrder,
    source: 'admin_shop_email_order_proof',
    delayDays: 0,
    testMode: true,
    webhookId: `proof-${String(sourceJob?._id || proofOrder.id)}-${Date.now()}`,
  });
  await ReviewRequestJob.updateOne(
    { _id: proofJob._id },
    { $set: { status: 'scheduled', scheduledAt: new Date(Date.now() - 5000), blockedReason: '', deliveryRequired: false, deliveredAt: new Date() } }
  );
  const sendResult = await sendDueReviewRequests({ limit: 1, jobId: proofJob._id });
  const refreshed = await ReviewRequestJob.findById(proofJob._id).lean();
  return {
    ok: true,
    proofRecipient,
    sourceOrderId: sourceJob?.orderName || sourceJob?.orderId || '',
    job: refreshed || proofJob,
    sendResult,
  };
}


function publicReviewRequestJob(job = {}) {
  return {
    id: String(job._id || ''),
    status: job.status || '',
    orderId: job.orderName || job.orderId || '',
    email: job.customerEmail || '',
    customerName: job.customerName || '',
    productCount: Array.isArray(job.products) ? job.products.length : 0,
    scheduledAt: job.scheduledAt || null,
    sentAt: job.sentAt || null,
    deliveredAt: job.deliveredAt || null,
    delayDays: Number(job.delayDays || 0),
    attempts: Number(job.attempts || 0),
    blockedReason: job.blockedReason || job.errorMessage || '',
    deliveryRequired: Boolean(job.deliveryRequired),
    requiredDeliveryTag: job.requiredDeliveryTag || 'delivered',
    testMode: Boolean(job.testMode),
  };
}

function reviewJobOutstandingReason(job = {}, now = new Date()) {
  const status = String(job.status || '').toLowerCase();
  const scheduledAt = job.scheduledAt ? new Date(job.scheduledAt) : null;
  if (status === 'failed') return 'failed';
  if (status === 'blocked') return 'blocked';
  if (status === 'awaiting_delivery') return 'awaiting_delivery';
  if (status === 'scheduled' && scheduledAt && !Number.isNaN(scheduledAt.getTime()) && scheduledAt <= now) return 'due_now';
  if (status === 'scheduled') return 'scheduled_future';
  return status || 'unknown';
}

async function outstandingReviewAutomationSnapshot(shopDomain) {
  const now = new Date();
  const jobs = await ReviewRequestJob.find({
    shopDomain,
    status: { $in: ['scheduled', 'failed', 'blocked', 'awaiting_delivery'] },
  }).sort({ status: 1, scheduledAt: 1, createdAt: -1 }).limit(80).lean();
  const decorated = jobs.map((job) => ({ ...publicReviewRequestJob(job), outstandingReason: reviewJobOutstandingReason(job, now) }));
  return {
    ok: true,
    generatedAt: now.toISOString(),
    dueNow: decorated.filter((job) => job.outstandingReason === 'due_now').length,
    failed: decorated.filter((job) => job.outstandingReason === 'failed').length,
    blocked: decorated.filter((job) => job.outstandingReason === 'blocked').length,
    awaitingDelivery: decorated.filter((job) => job.outstandingReason === 'awaiting_delivery').length,
    scheduledFuture: decorated.filter((job) => job.outstandingReason === 'scheduled_future').length,
    actionable: decorated.filter((job) => ['due_now', 'failed', 'blocked', 'awaiting_delivery'].includes(job.outstandingReason)).length,
    jobs: decorated,
  };
}

async function manualSendReviewJobToCustomer({ shopDomain, sourceJob, bypassDelivery = false }) {
  if (!sourceJob) {
    const error = new Error('Review request job not found for this shop.');
    error.statusCode = 404;
    throw error;
  }
  if (sourceJob.testMode) {
    const error = new Error('This is a test job. Use Send proof to shop email instead.');
    error.statusCode = 400;
    throw error;
  }
  if (sourceJob.status === 'sent') {
    const error = new Error('This review request has already been sent.');
    error.statusCode = 400;
    throw error;
  }
  if (!sourceJob.customerEmail) {
    const error = new Error('This order has no customer email, so it cannot be sent manually.');
    error.statusCode = 400;
    throw error;
  }
  if (sourceJob.status === 'awaiting_delivery' && !bypassDelivery) {
    const error = new Error('This order is waiting for the delivered tag. Confirm manual delivery override before sending to the customer.');
    error.statusCode = 400;
    throw error;
  }
  const now = new Date();
  const update = {
    status: 'scheduled',
    scheduledAt: new Date(now.getTime() - 5000),
    blockedReason: '',
    errorMessage: '',
    lastManualSendAt: now,
  };
  if (bypassDelivery || sourceJob.status === 'awaiting_delivery') {
    update.deliveryRequired = false;
    update.deliveredAt = sourceJob.deliveredAt || now;
    update.manualDeliveryOverrideAt = now;
  }
  await ReviewRequestJob.updateOne({ _id: sourceJob._id, shopDomain }, { $set: update, $inc: { manualSendAttempts: 1 } });
  const sendResult = await sendDueReviewRequests({ limit: 1, jobId: sourceJob._id });
  const refreshed = await ReviewRequestJob.findById(sourceJob._id).lean();
  return {
    ok: true,
    sendResult,
    job: publicReviewRequestJob(refreshed || sourceJob),
  };
}

function looksLikeEmailAddressHost(value = '') {
  const v = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function assertValidSmtpHost(value = '') {
  const host = cleanText(value, 200);
  if (!host) return 'SMTP host is required.';
  if (looksLikeEmailAddressHost(host)) {
    return 'SMTP host cannot be an email address. Use the mail server host, for example smtp.gmail.com or smtp.office365.com, and put the email address in SMTP username / From email.';
  }
  if (/^https?:\/\//i.test(host) || /\//.test(host)) {
    return 'SMTP host should be only the server name, for example smtp.gmail.com, not a URL.';
  }
  return '';
}

function publicEmailSendError(error = {}) {
  const code = error.code ? ` (${error.code})` : '';
  const response = error.response || error.command || error.reason || '';
  const message = error.message || 'Unknown SMTP error';
  const joined = `${message}${code}${response ? ` — ${response}` : ''}`;
  if (/auth|credentials|invalid login|username|password|app password/i.test(joined)) return `Email provider rejected the login. Check the SMTP username and app password. ${joined}`;
  if (/queryA EBADNAME|badname/i.test(joined)) return `SMTP host looks invalid. The host should be a mail server such as smtp.gmail.com, not an email address. ${joined}`;
  if (/enotfound|econnrefused|etimedout|timeout|dns/i.test(joined)) return `Could not reach the SMTP server. Check host, port and security mode. ${joined}`;
  if (/recipient|mailbox|relay|550|553|554/i.test(joined)) return `The email provider rejected the recipient or sender. ${joined}`;
  return `Email send failed: ${joined}`;
}


async function buildCampaignAnalytics(shopDomain, options = {}) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const includeTest = Boolean(options.includeTest);
  const [allEvents, allReviews] = await Promise.all([
    CampaignEvent.find({ shopDomain, createdAt: { $gte: since } }).lean(),
    Review.find({ shopDomain, createdAt: { $gte: since } }).lean(),
  ]);
  const isTestEvent = (event = {}) => String(event.campaign || '').toLowerCase().includes('test') || String(event.token || '').toLowerCase().startsWith('test');
  const isTestReview = (review = {}) => Boolean(review.isTestReview || review.testMode) || String(review.campaign || '').toLowerCase().includes('test');
  const excludedTestEvents = allEvents.filter(isTestEvent).length;
  const excludedTestReviews = allReviews.filter(isTestReview).length;
  const events = includeTest ? allEvents : allEvents.filter((event) => !isTestEvent(event));
  const reviews = includeTest ? allReviews : allReviews.filter((review) => !isTestReview(review));

  const campaignMap = {};
  const makeRecipientKey = (event = {}) => {
    const token = cleanText(event.token, 200);
    if (token) return `token:${token}`;
    const email = cleanEmail(event.email);
    const orderId = cleanText(event.orderId, 120);
    const itemId = cleanText(event.itemId, 120);
    return `fallback:${email}:${orderId}:${itemId || 'order'}`;
  };
  const ensure = (campaign) => {
    const name = campaign || 'review_request';
    if (!campaignMap[name]) {
      campaignMap[name] = {
        sent: new Map(),
        open: new Map(),
        click: new Map(),
        reviewed: new Map(),
        rawOpenEvents: 0,
        rawClickEvents: 0,
      };
    }
    return campaignMap[name];
  };
  const safeEvent = (event) => ({
    campaign: event.campaign || 'review_request',
    eventType: event.eventType,
    email: event.email || '',
    orderId: event.orderId || '',
    itemId: event.itemId || '',
    token: event.token || '',
    subject: event.subject || '',
    templateName: event.templateName || '',
    layoutName: event.layoutName || '',
    moduleNames: Array.isArray(event.moduleNames) ? event.moduleNames : [],
    htmlHash: event.htmlHash || '',
    createdAt: event.createdAt,
    isTest: String(event.campaign || '').toLowerCase().includes('test') || String(event.token || '').toLowerCase().startsWith('test'),
  });

  events.forEach((event) => {
    const type = event.eventType;
    const group = ensure(event.campaign || 'review_request');
    const key = makeRecipientKey(event);
    if (type === 'open') group.rawOpenEvents += 1;
    if (type === 'click') group.rawClickEvents += 1;
    if (['sent', 'open', 'click'].includes(type) && key) {
      if (!group[type].has(key)) group[type].set(key, safeEvent(event));
    }
  });

  reviews.forEach((review) => {
    const campaign = review.isTestReview || review.testMode ? 'test_review_request' : (review.campaign || review.source === 'email' ? 'review_request' : 'storefront_review');
    const group = ensure(campaign);
    const key = `review:${cleanEmail(review.email)}:${cleanText(review.orderId, 120)}:${cleanText(review.itemId, 120) || String(review._id)}`;
    if (!group.reviewed.has(key)) {
      group.reviewed.set(key, {
        campaign,
        eventType: 'reviewed',
        email: review.email || '',
        orderId: review.orderId || '',
        itemId: review.itemId || '',
        createdAt: review.createdAt,
        isTest: Boolean(review.isTestReview || review.testMode),
      });
    }
  });

  const byCampaign = {};
  const totals = { sent: 0, open: 0, click: 0, reviewed: 0, rawOpenEvents: 0, rawClickEvents: 0 };
  const lists = { sent: [], opened: [], clicked: [], reviewed: [] };

  Object.entries(campaignMap).forEach(([campaign, group]) => {
    const rawSent = group.sent.size;
    const rawOpen = group.open.size;
    const rawClick = group.click.size;
    const sent = rawSent;
    const open = sent ? Math.min(rawOpen, sent) : 0;
    const click = sent ? Math.min(rawClick, sent) : 0;
    const reviewed = group.reviewed.size;
    const openRate = sent ? Math.min(100, Number(((open / sent) * 100).toFixed(1))) : 0;
    const clickRate = sent ? Math.min(100, Number(((click / sent) * 100).toFixed(1))) : 0;
    byCampaign[campaign] = {
      sent,
      rawSent,
      open,
      rawOpen,
      click,
      rawClick,
      reviewed,
      rawOpenEvents: group.rawOpenEvents,
      rawClickEvents: group.rawClickEvents,
      openRate,
      clickRate,
      isTest: campaign.toLowerCase().includes('test'),
    };
    totals.sent += sent;
    totals.open += open;
    totals.click += click;
    totals.reviewed += reviewed;
    totals.rawOpenEvents += group.rawOpenEvents;
    totals.rawClickEvents += group.rawClickEvents;
    group.sent.forEach((event) => lists.sent.push(event));
    group.open.forEach((event) => lists.opened.push(event));
    group.click.forEach((event) => lists.clicked.push(event));
    group.reviewed.forEach((event) => lists.reviewed.push(event));
  });

  Object.keys(lists).forEach((key) => {
    lists[key] = lists[key].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
  });

  const recipientMap = new Map();
  const recipientKey = (event = {}) => {
    const email = cleanEmail(event.email) || 'no-email';
    const orderId = cleanText(event.orderId, 120) || 'no-order';
    const campaign = cleanText(event.campaign, 120) || 'review_request';
    return `${campaign}:${email}:${orderId}`;
  };
  events.forEach((event) => {
    const key = recipientKey(event);
    if (!recipientMap.has(key)) {
      recipientMap.set(key, {
        campaign: event.campaign || 'review_request',
        email: event.email || '',
        orderId: event.orderId || '',
        itemId: event.itemId || '',
        token: event.token || '',
        isTest: String(event.campaign || '').toLowerCase().includes('test') || String(event.token || '').toLowerCase().startsWith('test'),
        sentAt: null,
        openedAt: null,
        clickedAt: null,
        reviewedAt: null,
        subject: '',
        templateName: '',
        layoutName: '',
        moduleNames: [],
        htmlHash: '',
      });
    }
    const row = recipientMap.get(key);
    if (event.subject && !row.subject) row.subject = event.subject;
    if (event.templateName && !row.templateName) row.templateName = event.templateName;
    if (event.layoutName && !row.layoutName) row.layoutName = event.layoutName;
    if (Array.isArray(event.moduleNames) && event.moduleNames.length && !row.moduleNames.length) row.moduleNames = event.moduleNames;
    if (event.htmlHash && !row.htmlHash) row.htmlHash = event.htmlHash;
    const eventDate = event.createdAt;
    if (event.eventType === 'sent' && (!row.sentAt || new Date(eventDate) < new Date(row.sentAt))) row.sentAt = eventDate;
    if (event.eventType === 'open' && (!row.openedAt || new Date(eventDate) < new Date(row.openedAt))) row.openedAt = eventDate;
    if (event.eventType === 'click' && (!row.clickedAt || new Date(eventDate) < new Date(row.clickedAt))) row.clickedAt = eventDate;
  });
  reviews.forEach((review) => {
    const campaign = review.isTestReview || review.testMode ? 'test_review_request' : (review.campaign || review.source === 'email' ? 'review_request' : 'storefront_review');
    const key = `${campaign}:${cleanEmail(review.email) || 'no-email'}:${cleanText(review.orderId, 120) || 'no-order'}`;
    if (!recipientMap.has(key)) {
      recipientMap.set(key, { campaign, email: review.email || '', orderId: review.orderId || '', itemId: review.itemId || '', token: '', isTest: Boolean(review.isTestReview || review.testMode), sentAt: null, openedAt: null, clickedAt: null, reviewedAt: null });
    }
    const row = recipientMap.get(key);
    if (!row.reviewedAt || new Date(review.createdAt) < new Date(row.reviewedAt)) row.reviewedAt = review.createdAt;
  });
  const recipients = Array.from(recipientMap.values())
    .sort((a, b) => new Date(b.sentAt || b.openedAt || b.reviewedAt || 0) - new Date(a.sentAt || a.openedAt || a.reviewedAt || 0))
    .slice(0, 100);

  return {
    windowDays: 30,
    includeTest,
    excludedTestEvents,
    excludedTestReviews,
    totals,
    byCampaign,
    openRate: totals.sent ? Math.min(100, Number(((totals.open / totals.sent) * 100).toFixed(1))) : 0,
    clickRate: totals.sent ? Math.min(100, Number(((totals.click / totals.sent) * 100).toFixed(1))) : 0,
    lists,
    recipients,
    recentEvents: events
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20),
  };
}

router.post('/review-tokens', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const body = req.body || {};
    const token = createReviewToken({
      shopDomain,
      email: cleanEmail(body.email),
      customerName: cleanText(body.customerName || body.name, 120),
      orderId: cleanText(body.orderId || body.order, 120),
      products: Array.isArray(body.products) ? body.products : [],
      expiresDays: clampNumber(body.expiresDays, 1, 90, 30),
      testMode: Boolean(body.testMode || body.isPreview),
    });
    if (!token) return res.status(500).json({ error: 'Could not create signed review token. Check EMAIL_CREDENTIAL_SECRET or SHOPIFY_API_SECRET.' });
    return res.json({ ok: true, token });
  } catch (error) {
    next(error);
  }
});

router.get('/session', async (req, res) => {
  const shop = await ensureShop(shopDomainFromReq(req));
  return res.json({
    ok: true,
    shopDomain: shop.shopDomain,
    authMode: req.adminAuthMode,
    modules: shop.modules,
  });
});

router.get('/modules', async (req, res) => {
  const shop = await ensureShop(shopDomainFromReq(req));
  return res.json({ modules: shop.modules });
});

router.get('/reviews', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const reviews = await Review.find({ shopDomain }).sort({ createdAt: -1 }).lean();
    return res.json(reviews);
  } catch (error) {
    next(error);
  }
});

router.get('/reviews/changes', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 5 * 60 * 1000);
    const count = await Review.countDocuments({ shopDomain, createdAt: { $gt: since }, isDeleted: false });
    return res.json({ count, since });
  } catch (error) {
    next(error);
  }
});

router.patch('/reviews/:id', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const allowed = {};

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      const status = cleanReviewStatus(req.body.status);
      if (!status) return res.status(400).json({ error: 'Invalid status.' });
      allowed.status = status;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'reply')) allowed.reply = cleanText(req.body.reply, 3000);
    if (Object.prototype.hasOwnProperty.call(req.body, 'replyVisibility')) allowed.replyVisibility = ['public', 'private'].includes(req.body.replyVisibility) ? req.body.replyVisibility : 'public';
    if (Object.prototype.hasOwnProperty.call(req.body, 'verifiedPurchase')) {
      allowed.verifiedPurchase = Boolean(req.body.verifiedPurchase);
      if (allowed.verifiedPurchase && !Object.prototype.hasOwnProperty.call(req.body, 'verificationNote')) {
        allowed.verificationNote = 'Manually verified by admin';
      }
      if (!allowed.verifiedPurchase && !Object.prototype.hasOwnProperty.call(req.body, 'verificationNote')) {
        allowed.verificationNote = '';
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'verificationNote')) allowed.verificationNote = cleanText(req.body.verificationNote, 250);
    if (Object.prototype.hasOwnProperty.call(req.body, 'isDeleted')) {
      allowed.isDeleted = Boolean(req.body.isDeleted);
      allowed.deletedAt = allowed.isDeleted ? new Date() : null;
    }

    const existing = await Review.findOne({ _id: req.params.id, shopDomain });
    if (!existing) return res.status(404).json({ error: 'Review not found.' });
    if ((existing.isTestReview || existing.testMode) && allowed.status === 'accepted') {
      return res.status(400).json({ error: 'Test reviews cannot be published to the storefront.' });
    }

    const review = await Review.findOneAndUpdate(
      { _id: req.params.id, shopDomain },
      { $set: allowed },
      { new: true }
    );

    if (allowed.status === 'accepted') {
      await awardForReview({ shopDomain, review, trigger: 'review_approved' }).catch((error) => console.warn('Loyalty award skipped:', error.message));
    }

    return res.json(review);
  } catch (error) {
    next(error);
  }
});

router.post('/reviews/import', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const reviews = Array.isArray(req.body.reviews) ? req.body.reviews : [];
    if (!reviews.length) return res.status(400).json({ error: 'No reviews supplied.' });
    if (reviews.length > 1000) return res.status(400).json({ error: 'Import limit is 1000 reviews at a time.' });

    const skipped = [];
    const docs = reviews.map((review, index) => {
      const itemId = cleanText(review.itemId, 160);
      if (!looksLikeShopifyProductId(itemId)) {
        skipped.push({ index, reason: 'Missing valid Shopify product ID', productTitle: review.productTitle || '', rawProductRef: review.rawProductRef || '' });
        return null;
      }
      const rating = clampNumber(review.rating, 1, 5, 5);
      return {
        shopDomain,
        itemId,
        productTitle: cleanText(review.productTitle || review.matchedProductTitle, 200),
        rating,
        userId: cleanText(review.userId || review.name || 'Imported Customer', 120) || 'Imported Customer',
        email: cleanEmail(review.email),
        headline: cleanText(review.headline || review.title || '', 160),
        comment: cleanText(review.comment || review.body, 2500),
        source: 'import',
        sourcePlatform: cleanText(review.sourcePlatform || req.body.sourcePlatform || 'generic', 80),
        sourceLabel: cleanText(review.sourceLabel || req.body.sourceLabel || 'Imported review', 120),
        externalReviewId: cleanText(review.externalReviewId || review.id || '', 160),
        importBatchId: cleanText(req.body.importBatchId || `import-${Date.now()}`, 80),
        status: 'accepted',
        verifiedPurchase: review.verifiedPurchase !== false,
        verificationNote: review.verifiedPurchase === false ? '' : cleanText(review.verificationNote || `Imported from ${review.sourceLabel || req.body.sourceLabel || 'previous review platform'}`, 250),
        createdAt: review.createdAt ? new Date(review.createdAt) : new Date(),
      };
    }).filter((review) => review && review.itemId && review.rating && (review.comment || review.headline));

    if (!docs.length) return res.status(400).json({ error: 'No valid import rows after mapping.', skipped });
    const inserted = await Review.insertMany(docs, { ordered: false });
    return res.status(201).json({ ok: true, imported: inserted.length, skipped });
  } catch (error) {
    next(error);
  }
});


router.get('/migration', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const settings = await Settings.findOneAndUpdate({ shopDomain }, { $setOnInsert: { shopDomain } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    const sourceBreakdown = await Review.aggregate([
      { $match: { shopDomain, isDeleted: { $ne: true }, isTestReview: { $ne: true }, testMode: { $ne: true } } },
      { $group: { _id: { source: '$source', platform: '$sourcePlatform', label: '$sourceLabel' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).catch(() => []);
    const yotpoImports = sourceBreakdown.filter((row) => String(row._id?.platform || '').toLowerCase().includes('yotpo')).reduce((sum, row) => sum + Number(row.count || 0), 0);
    const shopImports = sourceBreakdown.filter((row) => String(row._id?.platform || '').toLowerCase().includes('shop')).reduce((sum, row) => sum + Number(row.count || 0), 0);
    return res.json({
      migrationMode: publicMigrationSettings(settings),
      widgets: mergeReviewWidgets(settings?.reviewWidgetLibrary),
      sourceBreakdown,
      summary: {
        totalReviews: await Review.countDocuments({ shopDomain, isDeleted: { $ne: true }, isTestReview: { $ne: true }, testMode: { $ne: true } }),
        importedReviews: await Review.countDocuments({ shopDomain, source: 'import', isDeleted: { $ne: true } }),
        yotpoImports,
        shopImports,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/migration', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const body = req.body || {};
    const update = {};
    if (body.migrationMode) {
      update.migrationMode = {
        enabled: Boolean(body.migrationMode.enabled),
        sourcePlatform: cleanText(body.migrationMode.sourcePlatform || 'yotpo', 80),
        yotpoStillLive: body.migrationMode.yotpoStillLive !== false,
        nectarWidgetsEnabled: Boolean(body.migrationMode.nectarWidgetsEnabled),
        nectarEmailsEnabled: Boolean(body.migrationMode.nectarEmailsEnabled),
        duplicateSchemaProtection: body.migrationMode.duplicateSchemaProtection !== false,
        importOnlyPublished: body.migrationMode.importOnlyPublished !== false,
        importVerifiedWhenAvailable: body.migrationMode.importVerifiedWhenAvailable !== false,
        lastCheckedAt: new Date(),
        notes: cleanText(body.migrationMode.notes || '', 1500),
      };
    }
    if (Array.isArray(body.widgets)) {
      const defaults = defaultReviewWidgets();
      const allowed = new Set(defaults.map((item) => item.key));
      update.reviewWidgetLibrary = body.widgets
        .filter((item) => allowed.has(item.key))
        .map((item) => ({
          key: item.key,
          name: cleanText(item.name, 120),
          status: ['live', 'draft', 'coming_soon'].includes(item.status) ? item.status : 'draft',
          enabled: Boolean(item.enabled) && item.status !== 'coming_soon',
          placement: cleanText(item.placement, 80),
          description: cleanText(item.description, 240),
          renderSnippet: cleanText(item.renderSnippet, 300),
          updatedAt: new Date(),
        }));
    }
    const saved = await Settings.findOneAndUpdate({ shopDomain }, { $set: update, $setOnInsert: { shopDomain } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    return res.json({ ok: true, migrationMode: publicMigrationSettings(saved), widgets: mergeReviewWidgets(saved?.reviewWidgetLibrary) });
  } catch (error) {
    next(error);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const settings = await Settings.findOne({ shopDomain }).lean();
    if (settings) return res.json(settings);
    const created = await Settings.findOneAndUpdate({ shopDomain }, { $setOnInsert: { shopDomain } }, { new: true, upsert: true });
    return res.json(created);
  } catch (error) {
    next(error);
  }
});

router.patch('/settings', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const body = req.body || {};

    const update = {
      shopDomain,
      betaMode: {
        enabled: Boolean(body.betaMode?.enabled),
        email: cleanEmail(body.betaMode?.email),
      },
      trashRetentionDays: clampNumber(body.trashRetentionDays, 1, 28, 28),
      autoApproveEnabled: Boolean(body.autoApproveEnabled),
      autoApproveType: body.autoApproveType === 'all' ? 'all' : 'verified',
      autoApproveMinStars: clampNumber(body.autoApproveMinStars, 1, 5, 4),
      attributeProfiles: Array.isArray(body.attributeProfiles)
        ? body.attributeProfiles.slice(0, 20).map((attr) => ({
          type: cleanText(attr.type, 40),
          condition: cleanText(attr.condition, 160),
          label: cleanText(attr.label, 80),
        }))
        : [],
      seo: { richSnippets: body.seo?.richSnippets !== false },
      supportSettings: {
        supportEmail: cleanEmail(body.supportSettings?.supportEmail),
        supportFromName: cleanText(body.supportSettings?.supportFromName || 'Customer Support', 120),
        supportHeading: cleanText(body.supportSettings?.supportHeading || 'Need help with your order?', 180),
        supportText: cleanText(body.supportSettings?.supportText || 'If something did not go to plan, tell customer service before leaving a review.', 600),
        supportButtonText: cleanText(body.supportSettings?.supportButtonText || 'Contact customer service', 80),
        missingOrderKeywords: Array.isArray(body.supportSettings?.missingOrderKeywords) ? body.supportSettings.missingOrderKeywords.slice(0, 30).map((item) => cleanText(item, 80)).filter(Boolean) : ['missing','not arrived','not received','lost','missing item','wrong item','damaged'],
      },
      widgetStyles: {
        widgetTitle: cleanText(body.widgetStyles?.widgetTitle || 'Customer Reviews', 120),
        primaryColor: cleanText(body.widgetStyles?.primaryColor || '#000000', 20),
        starColor: cleanText(body.widgetStyles?.starColor || '#ffc700', 20),
        textSize: clampNumber(body.widgetStyles?.textSize, 10, 30, 15),
        layoutStyle: ['clean', 'cards', 'compact', 'carousel'].includes(body.widgetStyles?.layoutStyle) ? body.widgetStyles.layoutStyle : 'clean',
        previewState: ['reviews', 'empty'].includes(body.widgetStyles?.previewState) ? body.widgetStyles.previewState : 'reviews',
        emptyMode: ['simple', 'boxed', 'hidden', 'stars_text'].includes(body.widgetStyles?.emptyMode) ? body.widgetStyles.emptyMode : 'simple',
        emptyText: cleanText(body.widgetStyles?.emptyText || 'No reviews yet. Be the first to write one.', 180),
        maxWidth: clampNumber(body.widgetStyles?.maxWidth, 720, 1800, 1160),
        reviewStarSize: clampNumber(body.widgetStyles?.reviewStarSize, 24, 72, 52),
        reviewStarAlignment: ['left', 'center', 'right'].includes(body.widgetStyles?.reviewStarAlignment) ? body.widgetStyles.reviewStarAlignment : 'left',
        headerAlignment: ['left', 'center', 'right'].includes(body.widgetStyles?.headerAlignment || body.widgetStyles?.reviewStarAlignment) ? (body.widgetStyles.headerAlignment || body.widgetStyles.reviewStarAlignment) : 'left',
        buttonStyle: ['solid', 'pill', 'outline'].includes(body.widgetStyles?.buttonStyle) ? body.widgetStyles.buttonStyle : 'solid',
        buttonRadius: clampNumber(body.widgetStyles?.buttonRadius, 0, 999, 8),
        cardRadius: clampNumber(body.widgetStyles?.cardRadius, 0, 40, 14),
        showSummary: body.widgetStyles?.showSummary !== false,
        showVerifiedLabel: body.widgetStyles?.showVerifiedLabel !== false,
        sliderTrackColor: cleanText(body.widgetStyles?.sliderTrackColor || '#e6ebf1', 20),
        sliderKnobColor: cleanText(body.widgetStyles?.sliderKnobColor || '#111111', 20),
        widgetBackground: cleanText(body.widgetStyles?.widgetBackground || 'none', 30),
        reviewCardBackground: cleanText(body.widgetStyles?.reviewCardBackground || '#ffffff', 30),
      },
      cardStyles: {
        starSize: clampNumber(body.cardStyles?.starSize, 10, 40, 14),
        showCount: body.cardStyles?.showCount !== false,
        badgeBackground: cleanText(body.cardStyles?.badgeBackground || '#111827', 20),
        badgeTextColor: cleanText(body.cardStyles?.badgeTextColor || '#ffffff', 20),
        badgeStarColor: cleanText(body.cardStyles?.badgeStarColor || body.cardStyles?.starColor || '#ffc700', 20),
        badgeRadius: clampNumber(body.cardStyles?.badgeRadius, 0, 999, 999),
        badgeLayout: ['pill','button','compact','stacked','plain'].includes(body.cardStyles?.badgeLayout) ? body.cardStyles.badgeLayout : 'pill',
        badgePosition: ['above','below','inline','under_title_right','image_top_left','image_top_right','image_bottom_left','image_bottom_right'].includes(body.cardStyles?.badgePosition) ? body.cardStyles.badgePosition : 'below',
        badgePadding: cleanText(body.cardStyles?.badgePadding || '6px 12px', 40),
        badgeLabel: cleanText(body.cardStyles?.badgeLabel || '4.8 (12)', 80),
      },
      carouselStyles: {
        layout: ['grid', 'infinite', 'masonry'].includes(body.carouselStyles?.layout) ? body.carouselStyles.layout : 'infinite',
        autoplay: body.carouselStyles?.autoplay !== false,
        delay: clampNumber(body.carouselStyles?.delay, 1000, 20000, 4000),
        showArrows: Boolean(body.carouselStyles?.showArrows),
        limit: clampNumber(body.carouselStyles?.limit, 1, 50, 10),
      },
    };

    const saved = await Settings.findOneAndUpdate({ shopDomain }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true });
    return res.json(saved);
  } catch (error) {
    next(error);
  }
});


router.get('/trash/summary', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const config = await Settings.findOne({ shopDomain }).lean();
    const rows = await Review.find({ shopDomain, isDeleted: true }).select('deletedAt updatedAt createdAt').lean();
    const oldest = rows
      .map((row) => row.deletedAt || row.updatedAt || row.createdAt)
      .filter(Boolean)
      .sort((a, b) => new Date(a) - new Date(b))[0] || null;
    return res.json({ count: rows.length, oldestDeletedAt: oldest, retentionDays: config?.trashRetentionDays || 28 });
  } catch (error) { next(error); }
});

router.post('/trash/empty', async (req, res, next) => {
  try {
    const result = await Review.deleteMany({ shopDomain: shopDomainFromReq(req), isDeleted: true });
    return res.json({ ok: true, deleted: result.deletedCount || 0 });
  } catch (error) { next(error); }
});

router.post('/trash/cleanup', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const retentionDays = clampNumber(req.body?.retentionDays, 1, 28, 28);
    await Settings.findOneAndUpdate({ shopDomain }, { $set: { shopDomain, trashRetentionDays: retentionDays } }, { upsert: true, setDefaultsOnInsert: true });
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await Review.deleteMany({ shopDomain, isDeleted: true, deletedAt: { $lte: cutoff } });
    return res.json({ ok: true, deleted: result.deletedCount || 0, retentionDays });
  } catch (error) { next(error); }
});

router.post('/trash/restore-all', async (req, res, next) => {
  try {
    const result = await Review.updateMany({ shopDomain: shopDomainFromReq(req), isDeleted: true }, { $set: { isDeleted: false, deletedAt: null } });
    return res.json({ ok: true, restored: result.modifiedCount || 0 });
  } catch (error) { next(error); }
});

router.get('/stats', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const reviews = await Review.find({ shopDomain, isDeleted: false, isTestReview: { $ne: true }, testMode: { $ne: true } }).lean();
    const config = await Settings.findOne({ shopDomain }).lean();
    const sources = { website: 0, email: 0, import: 0 };
    const statuses = { accepted: 0, pending: 0, hold: 0, rejected: 0, spam: 0 };
    const ratings = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const products = {};

    const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const dayKey = (date) => date.toISOString().slice(0, 10);
    const weekKey = (date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    };
    const yearKey = (date) => String(date.getFullYear());
    const buildSeries = (keys) => keys.map((key) => ({ label: key, count: 0 }));
    const now = new Date();
    const dailyKeys = Array.from({ length: 30 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (29 - i)); return dayKey(d); });
    const weeklyKeys = Array.from({ length: 12 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - ((11 - i) * 7)); return weekKey(d); });
    const monthlyKeys = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1); return monthKey(d); });
    const yearlyKeys = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - (4 - i)));
    const timeSeries = {
      day: buildSeries(dailyKeys),
      week: buildSeries(weeklyKeys),
      month: buildSeries(monthlyKeys),
      year: buildSeries(yearlyKeys),
    };
    const maps = {
      day: Object.fromEntries(timeSeries.day.map((p) => [p.label, p])),
      week: Object.fromEntries(timeSeries.week.map((p) => [p.label, p])),
      month: Object.fromEntries(timeSeries.month.map((p) => [p.label, p])),
      year: Object.fromEntries(timeSeries.year.map((p) => [p.label, p])),
    };

    reviews.forEach((review) => {
      if (sources[review.source] !== undefined) sources[review.source] += 1;
      if (statuses[review.status] !== undefined) statuses[review.status] += 1;
      const rating = Math.max(1, Math.min(5, Math.round(Number(review.rating || 0))));
      if (ratings[rating] !== undefined) ratings[rating] += 1;

      const id = String(review.itemId || 'Unknown');
      if (!products[id]) products[id] = { id, count: 0, liveCount: 0, sum: 0, title: null };
      products[id].count += 1;
      products[id].sum += Number(review.rating || 0);
      if (review.status === 'accepted') products[id].liveCount += 1;

      const created = new Date(review.createdAt || review.updatedAt || Date.now());
      if (!Number.isNaN(created.getTime())) {
        const dk = dayKey(created); if (maps.day[dk]) maps.day[dk].count += 1;
        const wk = weekKey(created); if (maps.week[wk]) maps.week[wk].count += 1;
        const mk = monthKey(created); if (maps.month[mk]) maps.month[mk].count += 1;
        const yk = yearKey(created); if (maps.year[yk]) maps.year[yk].count += 1;
      }
    });

    let topProduct = { id: 'N/A', count: 0, liveCount: 0, averageRating: '0.0', title: null, image: null };
    const productRows = Object.values(products)
      .map((item) => ({ ...item, averageRating: item.count ? Number((item.sum / item.count).toFixed(1)) : 0 }))
      .sort((a, b) => b.count - a.count);
    if (productRows.length) {
      const item = productRows[0];
      topProduct = { id: item.id, count: item.count, liveCount: item.liveCount, averageRating: item.averageRating.toFixed(1), title: null, image: null };
      try {
        const productData = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products/${item.id}.json?fields=id,title,image`, { shopDomain });
        if (productData?.product) {
          topProduct.title = productData.product.title;
          topProduct.image = productData.product.image?.src || null;
          productRows[0].title = productData.product.title;
        }
      } catch (error) {
        console.warn('Could not fetch top product details:', error.message);
      }
    }

    const sent = config?.emailsSentTotal || 0;
    return res.json({
      totalReviews: reviews.length,
      liveReviews: statuses.accepted,
      pendingReviews: statuses.pending + statuses.hold,
      sources,
      statuses,
      ratings,
      timeSeries,
      products: productRows.slice(0, 12),
      topProduct,
      emailStats: {
        sent,
        completed: sources.email,
        rate: sent ? Number(((sources.email / sent) * 100).toFixed(1)) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/campaign-analytics', async (req, res, next) => {
  try {
    const includeTest = ['1', 'true', 'yes'].includes(String(req.query.includeTest || '').toLowerCase());
    const analytics = await buildCampaignAnalytics(shopDomainFromReq(req), { includeTest });
    return res.json(analytics);
  } catch (error) {
    next(error);
  }
});


router.get('/email-provider-profiles', async (req, res, next) => {
  try {
    const providers = await EmailProviderProfile.find({ shopDomain: shopDomainFromReq(req) }).sort({ updatedAt: -1 }).lean();
    return res.json({ providers: providers.map(publicProviderProfile) });
  } catch (error) {
    next(error);
  }
});

router.post('/email-provider-profiles', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const body = req.body || {};
    const name = cleanText(body.name || body.fromName || 'Email provider', 120);
    const existing = await EmailProviderProfile.findOne({ shopDomain, name });
    let update;
    try {
      update = providerUpdateFromBody(body, existing);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    update.shopDomain = shopDomain;
    update.name = name;
    const primaryFor = Array.isArray(body.primaryFor) ? body.primaryFor.map((item) => cleanText(item, 40)).filter(Boolean) : [];
    update.primaryFor = primaryFor;

    for (const purpose of primaryFor) {
      await EmailProviderProfile.updateMany({ shopDomain, primaryFor: purpose }, { $pull: { primaryFor: purpose } });
    }

    const saved = await EmailProviderProfile.findOneAndUpdate(
      { shopDomain, name },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.json({ provider: publicProviderProfile(saved) });
  } catch (error) {
    next(error);
  }
});

router.post('/email-provider-profiles/:id/use', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const purpose = cleanText(req.body?.purpose || 'reviews', 40);
    const provider = await EmailProviderProfile.findOne({ _id: req.params.id, shopDomain });
    if (!provider) return res.status(404).json({ error: 'Provider profile not found.' });
    if (!provider.smtpPassEncrypted) return res.status(400).json({ error: 'This provider does not have a saved password/app password.' });

    await EmailProviderProfile.updateMany({ shopDomain, primaryFor: purpose }, { $pull: { primaryFor: purpose } });
    await EmailProviderProfile.updateOne({ _id: provider._id }, { $addToSet: { primaryFor: purpose }, $set: { lastUsedAt: new Date() } });

    const active = await EmailProviderSettings.findOneAndUpdate(
      { shopDomain },
      {
        $set: {
          shopDomain,
          enabled: provider.enabled,
          provider: provider.provider,
          smtpHost: provider.smtpHost,
          smtpPort: provider.smtpPort,
          secureMode: provider.secureMode,
          smtpUser: provider.smtpUser,
          smtpPassEncrypted: provider.smtpPassEncrypted,
          fromName: provider.fromName,
          fromEmail: provider.fromEmail,
          replyToEmail: provider.replyToEmail,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.json({ ok: true, active: publicEmailSettings(active) });
  } catch (error) {
    next(error);
  }
});

router.post('/email-provider-profiles/:id/unassign', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const purpose = cleanText(req.body?.purpose || 'reviews', 40);
    const provider = await EmailProviderProfile.findOneAndUpdate(
      { _id: req.params.id, shopDomain },
      { $pull: { primaryFor: purpose } },
      { new: true }
    );
    if (!provider) return res.status(404).json({ error: 'Provider profile not found.' });
    return res.json({ provider: publicProviderProfile(provider) });
  } catch (error) {
    next(error);
  }
});

router.delete('/email-provider-profiles/:id', async (req, res, next) => {
  try {
    await EmailProviderProfile.deleteOne({ _id: req.params.id, shopDomain: shopDomainFromReq(req) });
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/email-settings', async (req, res, next) => {
  try {
    const settings = await EmailProviderSettings.findOne({ shopDomain: shopDomainFromReq(req) });
    return res.json(publicEmailSettings(settings));
  } catch (error) {
    next(error);
  }
});

router.patch('/email-settings', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const body = req.body || {};
    const existing = await EmailProviderSettings.findOne({ shopDomain });

    if (!body.provider || body.provider === 'none') return res.status(400).json({ error: 'Choose a provider.' });
    if (!body.smtpHost || !body.smtpUser || !body.fromEmail) {
      return res.status(400).json({ error: 'SMTP host, username, and from email are required.' });
    }
    const smtpHostError = assertValidSmtpHost(body.smtpHost);
    if (smtpHostError) return res.status(400).json({ error: smtpHostError });
    if (!body.smtpPass && !existing?.smtpPassEncrypted) {
      return res.status(400).json({ error: 'SMTP password/app password is required the first time you save.' });
    }

    const update = {
      shopDomain,
      enabled: body.enabled !== false,
      provider: cleanText(body.provider, 60),
      smtpHost: cleanText(body.smtpHost, 200),
      smtpPort: clampNumber(body.smtpPort, 1, 65535, 587),
      secureMode: ['starttls', 'ssl', 'none'].includes(body.secureMode) ? body.secureMode : 'starttls',
      smtpUser: cleanText(body.smtpUser, 254),
      fromName: cleanText(body.fromName, 120),
      fromEmail: cleanEmail(body.fromEmail),
      replyToEmail: cleanEmail(body.replyToEmail),
    };
    if (body.smtpPass) update.smtpPassEncrypted = encryptSecret(body.smtpPass);

    const saved = await EmailProviderSettings.findOneAndUpdate({ shopDomain }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true });

    // Keep the multi-provider library in sync whenever the merchant saves the active sender.
    // This prevents the confusing state where Gmail/SMTP is connected but the Saved providers
    // column is empty. We use the encrypted password already stored on the active settings.
    const profileName = cleanText(body.name || body.profileName || update.fromName || update.fromEmail || 'Reviews email provider', 120);
    const primaryFor = Array.isArray(body.primaryFor)
      ? body.primaryFor.map((item) => cleanText(item, 40)).filter(Boolean)
      : [cleanText(body.primaryFor || 'reviews', 40)].filter(Boolean);

    for (const purpose of primaryFor) {
      await EmailProviderProfile.updateMany({ shopDomain, primaryFor: purpose }, { $pull: { primaryFor: purpose } }).catch(() => {});
    }

    await EmailProviderProfile.findOneAndUpdate(
      { shopDomain, name: profileName },
      {
        $set: {
          shopDomain,
          name: profileName,
          enabled: saved.enabled,
          provider: saved.provider,
          smtpHost: saved.smtpHost,
          smtpPort: saved.smtpPort,
          secureMode: saved.secureMode,
          smtpUser: saved.smtpUser,
          smtpPassEncrypted: saved.smtpPassEncrypted,
          fromName: saved.fromName,
          fromEmail: saved.fromEmail,
          replyToEmail: saved.replyToEmail,
          primaryFor,
          lastUsedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).catch((error) => console.warn('Provider profile sync skipped:', error.message));

    return res.json(publicEmailSettings(saved));
  } catch (error) {
    next(error);
  }
});

router.delete('/email-settings', async (req, res, next) => {
  try {
    await EmailProviderSettings.deleteOne({ shopDomain: shopDomainFromReq(req) });
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});



router.get('/email-font-overrides', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const area = cleanTemplateArea(req.query.area || 'reviews');
    const settings = await Settings.findOne({ shopDomain }).lean();
    const fonts = settings?.fontOverrides?.[area] || [];
    return res.json({ ok: true, area, fonts: cleanFontOverrides(fonts) });
  } catch (error) {
    next(error);
  }
});

router.patch('/email-font-overrides', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const area = cleanTemplateArea(req.body.area || 'reviews');
    const fonts = cleanFontOverrides(req.body.fonts || []);
    const update = { [`fontOverrides.${area}`]: fonts };
    await Settings.findOneAndUpdate({ shopDomain }, { $set: update, $setOnInsert: { shopDomain } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    return res.json({ ok: true, area, fonts });
  } catch (error) {
    next(error);
  }
});


router.get('/email-templates', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const area = cleanTemplateArea(req.query.area || 'reviews');
    const kind = cleanTemplateKind(req.query.kind || 'review_request');
    const templates = await EmailTemplate.find({ shopDomain, area, kind }).sort({ isPrimary: -1, updatedAt: -1 }).lean();
    return res.json({ ok: true, templates: templates.map(publicEmailTemplate) });
  } catch (error) {
    next(error);
  }
});

router.post('/email-templates', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const area = cleanTemplateArea(req.body.area || 'reviews');
    const kind = cleanTemplateKind(req.body.kind || 'review_request');
    const isPrimary = Boolean(req.body.isPrimary);
    const templateName = cleanText(req.body.name || 'Review request template', 120);
    if (isPrimary) await EmailTemplate.updateMany({ shopDomain, area, kind }, { $set: { isPrimary: false } });
    const payload = {
      shopDomain,
      name: templateName,
      area,
      kind,
      enabled: req.body.enabled !== false,
      isPrimary,
      subject: cleanText(req.body.subject || 'How was your recent order?', 180),
      previewText: cleanText(req.body.previewText || '', 240),
      design: cleanTemplateDesign(req.body.design || {}),
      sections: cleanTemplateSections(req.body.sections || []),
      html: cleanText(req.body.html || '', 200000),
      notes: cleanText(req.body.notes || '', 1000),
    };
    const template = await EmailTemplate.findOneAndUpdate(
      { shopDomain, area, kind, name: templateName },
      { $set: payload, $setOnInsert: { createdAt: new Date() } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json({ ok: true, template: publicEmailTemplate(template) });
  } catch (error) {
    next(error);
  }
});

router.patch('/email-templates/:id', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const existing = await EmailTemplate.findOne({ _id: req.params.id, shopDomain });
    if (!existing) return res.status(404).json({ error: 'Template not found.' });
    const area = cleanTemplateArea(req.body.area || existing.area || 'reviews');
    const kind = cleanTemplateKind(req.body.kind || existing.kind || 'review_request');
    const isPrimary = req.body.isPrimary === undefined ? existing.isPrimary : Boolean(req.body.isPrimary);
    if (isPrimary) await EmailTemplate.updateMany({ shopDomain, area, kind, _id: { $ne: existing._id } }, { $set: { isPrimary: false } });
    existing.name = cleanText(req.body.name || existing.name || 'Review request template', 120);
    existing.area = area;
    existing.kind = kind;
    existing.enabled = req.body.enabled !== false;
    existing.isPrimary = isPrimary;
    existing.subject = cleanText(req.body.subject || existing.subject || 'How was your recent order?', 180);
    existing.previewText = cleanText(req.body.previewText || existing.previewText || '', 240);
    existing.design = cleanTemplateDesign(req.body.design || existing.design || {});
    existing.sections = cleanTemplateSections(req.body.sections || existing.sections || []);
    if (req.body.html !== undefined) existing.html = cleanText(req.body.html || '', 200000);
    existing.notes = cleanText(req.body.notes || existing.notes || '', 1000);
    await existing.save();
    return res.json({ ok: true, template: publicEmailTemplate(existing) });
  } catch (error) {
    next(error);
  }
});

router.post('/email-templates/:id/primary', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const template = await EmailTemplate.findOne({ _id: req.params.id, shopDomain });
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    await EmailTemplate.updateMany({ shopDomain, area: template.area, kind: template.kind }, { $set: { isPrimary: false } });
    template.isPrimary = true;
    template.enabled = true;
    await template.save();
    return res.json({ ok: true, template: publicEmailTemplate(template) });
  } catch (error) {
    next(error);
  }
});

router.delete('/email-templates/:id', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const result = await EmailTemplate.deleteOne({ _id: req.params.id, shopDomain });
    return res.json({ ok: true, deleted: Boolean(result.deletedCount) });
  } catch (error) {
    next(error);
  }
});


function cleanSimplePageHtml(value, fallback = '') {
  const raw = String(value || fallback || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/on\w+=['"][^'"]*['"]/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/\u0000/g, '')
    .trim();
  return raw.slice(0, 20000);
}

async function generateReviewPageSeoContent({ shopDomain, type = 'leave_review', handle = 'leave-review' }) {
  const fallback = type === 'all_reviews'
    ? {
        title: 'Customer Reviews',
        body_html: `<div class="nectar-reviews-page-placeholder"><h1>Customer Reviews</h1><p>Read verified customer feedback and see what shoppers think about our products and service.</p><p>This page is ready for the Nectar All Reviews SEO app block or Liquid snippet.</p><div id="nectar-all-reviews-page-root"></div></div>`,
        meta_title: 'Customer Reviews | Verified Buyer Feedback',
        meta_description: 'Read verified customer reviews, product feedback and shopping experiences from real customers.',
      }
    : {
        title: 'Leave a Review',
        body_html: `<div class="nectar-leave-review-placeholder"><h1>Leave a Review</h1><p>Thanks for shopping with us. Use your secure review link from your email to review your recent order.</p><p>If something did not go to plan, you can contact customer service before submitting your review.</p><div id="nectar-leave-review-root"></div></div>`,
        meta_title: 'Leave a Review | Share Your Feedback',
        meta_description: 'Share feedback on your recent order using your secure review link. Your review helps other customers shop with confidence.',
      };
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return { ...fallback, source: 'fallback' };
  try {
    const prompt = `Create concise Shopify page SEO and safe HTML body for ${type === 'all_reviews' ? 'an all customer reviews page' : 'a leave a review landing page'} for shop ${shopDomain}. Handle: ${handle}. Return JSON only with title, meta_title, meta_description, body_html. Body HTML must be simple, no scripts, and mention Nectar review block/root can be used.`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4, response_format: { type: 'json_object' } }),
    });
    if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
    const json = await response.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}');
    return {
      title: cleanText(parsed.title || fallback.title, 180),
      body_html: cleanSimplePageHtml(parsed.body_html || fallback.body_html, fallback.body_html),
      meta_title: cleanText(parsed.meta_title || fallback.meta_title, 180),
      meta_description: cleanText(parsed.meta_description || fallback.meta_description, 320),
      source: 'openai',
    };
  } catch (error) {
    return { ...fallback, source: 'fallback', warning: error.message || 'OpenAI generation failed' };
  }
}

function normalisePageHandle(value = '') {
  const raw = cleanText(value || '', 120).toLowerCase();
  return raw.replace(/^\/pages\//, '').replace(/^pages\//, '').replace(/^\//, '').replace(/\/$/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'leave-review';
}


function pageHandleAliases(handle) {
  const clean = normalisePageHandle(handle);
  const aliases = new Set([clean]);
  if (clean === 'leave-review') aliases.add('leave-a-review');
  if (clean === 'leave-a-review') aliases.add('leave-review');
  if (clean.includes('-a-')) aliases.add(clean.replace(/-a-/g, '-'));
  return Array.from(aliases).filter(Boolean);
}

function normalisePublicHost(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

async function storefrontDomainCandidates(shopDomain) {
  const domains = new Set();
  const add = (value) => { const host = normalisePublicHost(value); if (host) domains.add(host); };
  add(shopDomain);
  add(env.shopifyStoreUrl);

  // When possible, prefer the shop's primary storefront domain over the myshopify host.
  // Public page checks against myshopify can falsely 404 if the live theme/page only resolves on the primary domain.
  try {
    const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/shop.json`, { shopDomain });
    const shop = data?.shop || {};
    add(shop.primary_domain?.host || shop.primary_domain?.url || shop.primary_domain?.ssl_enabled_domain);
    add(shop.domain);
    add(shop.myshopify_domain);
  } catch (_) {}

  const list = Array.from(domains);
  const primaryFirst = list.sort((a, b) => {
    const aMy = a.includes('.myshopify.com') ? 1 : 0;
    const bMy = b.includes('.myshopify.com') ? 1 : 0;
    return aMy - bMy;
  });
  return primaryFirst.length ? primaryFirst : [normalisePublicHost(shopDomain)].filter(Boolean);
}

async function findShopifyPageByAdmin(shopDomain, aliases) {
  let adminAvailable = false;
  let adminError = '';

  for (const alias of aliases) {
    try {
      const pageData = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/pages.json?handle=${encodeURIComponent(alias)}&limit=1`, { shopDomain });
      if (pageData && Array.isArray(pageData.pages)) {
        adminAvailable = true;
        const page = pageData.pages.find((item) => String(item.handle || '').toLowerCase() === alias) || pageData.pages[0] || null;
        if (page) return { page, matchedHandle: String(page.handle || alias), adminAvailable, adminError };
      }
    } catch (error) {
      if (error.code === 'SHOPIFY_REINSTALL_REQUIRED' || error.status === 401 || error.status === 403) {
        adminError = error.message || 'Shopify Admin page scope is not available.';
        return { page: null, matchedHandle: '', adminAvailable: false, adminError };
      }
      adminError = error.message || adminError;
    }
  }

  // Some shops/API versions do not filter pages by handle consistently. Fall back to scanning a page list.
  if (adminAvailable) {
    try {
      const pageData = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/pages.json?limit=250`, { shopDomain });
      const pages = Array.isArray(pageData?.pages) ? pageData.pages : [];
      const page = pages.find((item) => aliases.includes(String(item.handle || '').toLowerCase()));
      if (page) return { page, matchedHandle: String(page.handle || '').toLowerCase(), adminAvailable: true, adminError };
    } catch (error) {
      adminError = error.message || adminError;
    }
  }

  return { page: null, matchedHandle: '', adminAvailable, adminError };
}

async function checkPublicStorefrontPage(domains, aliases) {
  const attempts = [];
  if (typeof fetch !== 'function') return { verified: false, attempts, statusCode: 0, url: '' };

  for (const host of domains) {
    for (const handle of aliases) {
      const url = `https://${host}/pages/${handle}`;
      try {
        const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(7000) });
        const contentType = response.headers.get('content-type') || '';
        const attempt = { url, handle, host, statusCode: response.status, ok: response.ok };
        attempts.push(attempt);
        if (response.ok && contentType.includes('text/html')) {
          const html = (await response.text()).slice(0, 120000).toLowerCase();
          const obviousMissing = response.url && /\/404($|[/?#])/.test(response.url.toLowerCase())
            || html.includes('template-404')
            || (html.includes('404') && (html.includes('page not found') || html.includes('not found')));
          if (!obviousMissing) {
            return { verified: true, attempts, statusCode: response.status, url, matchedHandle: handle, host };
          }
        }
      } catch (error) {
        attempts.push({ url, handle, host, error: error.message || 'storefront check failed' });
      }
    }
  }

  const last = attempts[attempts.length - 1] || {};
  return { verified: false, attempts, statusCode: last.statusCode || 0, url: last.url || '' };
}

async function checkShopifyStorefrontPage(shopDomain, handle, label = 'Storefront page') {
  const cleanHandle = normalisePageHandle(handle);
  const aliases = pageHandleAliases(cleanHandle);
  const domains = await storefrontDomainCandidates(shopDomain);
  const publicUrl = `https://${domains[0] || shopDomain}/pages/${cleanHandle}`;
  const expected = {
    label,
    handle: cleanHandle,
    aliases,
    url: publicUrl,
    status: 'missing',
    adminVerified: false,
    publicVerified: false,
    adminAvailable: false,
    published: false,
    pageId: '',
    title: '',
    detail: 'The page has not been verified yet.',
    checkedAt: new Date(),
  };

  const admin = await findShopifyPageByAdmin(shopDomain, aliases);
  expected.adminAvailable = Boolean(admin.adminAvailable);
  if (admin.adminError) expected.adminError = admin.adminError;

  if (admin.page) {
    const page = admin.page;
    expected.adminVerified = true;
    expected.pageId = String(page.id || '');
    expected.title = page.title || label;
    expected.handle = String(page.handle || cleanHandle).toLowerCase();
    expected.url = `https://${domains[0] || shopDomain}/pages/${expected.handle}`;
    expected.published = Boolean(page.published_at || page.publishedAt || page.published);
    expected.status = expected.published ? 'ready' : 'warning';
    expected.detail = expected.published
      ? `${label} exists in Shopify and is published.`
      : `${label} exists in Shopify but is not published yet.`;
    if (expected.handle !== cleanHandle) {
      expected.status = 'warning';
      expected.detail += ` It was found at /pages/${expected.handle}, but the current email handle is /pages/${cleanHandle}. Update the handle field before sending.`;
    }
    return expected;
  }

  const publicCheck = await checkPublicStorefrontPage(domains, aliases);
  expected.publicStatusCode = publicCheck.statusCode;
  expected.publicAttempts = publicCheck.attempts;

  if (publicCheck.verified) {
    expected.publicVerified = true;
    expected.published = true;
    expected.status = publicCheck.matchedHandle === cleanHandle ? 'ready' : 'warning';
    expected.url = publicCheck.url || expected.url;
    expected.detail = publicCheck.matchedHandle === cleanHandle
      ? `${label} is reachable on the storefront.`
      : `${label} is reachable at /pages/${publicCheck.matchedHandle}, but the current email handle is /pages/${cleanHandle}. Update the handle field before sending.`;
    return expected;
  }

  if (!expected.adminAvailable) {
    expected.status = 'warning';
    expected.detail = `${label} could not be verified from Shopify Admin because the installed token does not appear to have page-read access. I will not treat this as missing from a public storefront check alone. Emails and saved templates can still use /pages/${cleanHandle}; reconnect after adding read_content/write_content/read_online_store_pages if you want automatic verification and page creation.`;
    return expected;
  }

  const lastUrl = publicCheck.url || publicUrl;
  expected.detail = `${label} was not found in Shopify Admin for handle /pages/${cleanHandle}${aliases.length > 1 ? ` or alias /pages/${aliases.find((a) => a !== cleanHandle)}` : ''}. Last storefront check: ${lastUrl}.`;
  expected.status = 'missing';
  return expected;
}



router.get('/shopify-pages/search', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const q = cleanText(req.query.q || '', 120).toLowerCase();
    const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/pages.json?limit=50`, { shopDomain });
    if (!data || !Array.isArray(data.pages)) {
      return res.status(400).json({ error: 'Shopify pages could not be read. Add read_content/read_online_store_pages to Shopify scopes and reconnect the app.' });
    }
    const pages = data.pages
      .filter((page) => !q || String(page.title || '').toLowerCase().includes(q) || String(page.handle || '').toLowerCase().includes(q))
      .slice(0, 20)
      .map((page) => ({ id: String(page.id || ''), title: page.title || page.handle || 'Page', handle: page.handle || '', url: `/pages/${page.handle || ''}`, published: Boolean(page.published_at) }));
    return res.json({ ok: true, pages });
  } catch (error) { next(error); }
});

router.post('/storefront-pages/create', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const type = ['leave_review', 'all_reviews'].includes(req.body?.type) ? req.body.type : 'leave_review';
    const handle = normalisePageHandle(req.body?.handle || (type === 'all_reviews' ? 'reviews' : 'leave-review'));
    const existing = await checkShopifyStorefrontPage(shopDomain, handle, type === 'all_reviews' ? 'All Reviews page' : 'Leave Review page');
    if (existing.adminVerified || existing.publicVerified || existing.status === 'ready') {
      return res.json({ ok: true, created: false, page: existing, message: `/pages/${existing.handle || handle} already exists or is reachable.` });
    }
    if (!existing.adminAvailable && existing.status === 'warning') {
      return res.status(409).json({
        error: `Nectar could not prove /pages/${handle} is missing because Shopify page-read scope is not available. Reconnect with read_content/write_content/read_online_store_pages, or keep using the existing handle if you already created the page in Shopify.`,
        page: existing,
      });
    }
    const generated = await generateReviewPageSeoContent({ shopDomain, type, handle });
    const body = {
      page: {
        title: generated.title,
        handle,
        body_html: generated.body_html,
        published: true,
        metafields_global_title_tag: generated.meta_title,
        metafields_global_description_tag: generated.meta_description,
      },
    };
    const created = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/pages.json`, { shopDomain, method: 'POST', body: JSON.stringify(body) });
    const page = created.page || {};
    return res.status(201).json({ ok: true, created: true, source: generated.source, warning: generated.warning || '', page: { id: String(page.id || ''), title: page.title || generated.title, handle: page.handle || handle, url: `https://${shopDomain}/pages/${page.handle || handle}`, published: Boolean(page.published_at) }, message: `Created /pages/${page.handle || handle}. Add the Nectar theme/app block if required.` });
  } catch (error) {
    if (error.code === 'SHOPIFY_REINSTALL_REQUIRED' || error.status === 401 || error.status === 403) {
      error.message = `${error.message}. To create Shopify pages, add read_content, write_content and read_online_store_pages scopes, run shopify app deploy, then reconnect/reinstall the app.`;
    }
    next(error);
  }
});

router.get('/storefront-page-checks', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const reviewHandle = normalisePageHandle(req.query.reviewPageHandle || req.query.reviewHandle || 'leave-review');
    const allReviewsHandle = normalisePageHandle(req.query.allReviewsPageHandle || req.query.reviewsHandle || 'reviews');
    const pages = await Promise.all([
      checkShopifyStorefrontPage(shopDomain, reviewHandle, 'Leave Review page'),
      checkShopifyStorefrontPage(shopDomain, allReviewsHandle, 'All Reviews page'),
    ]);
    const readyCount = pages.filter((page) => page.status === 'ready').length;
    return res.json({ ok: true, shopDomain, pages, summary: { expectedCount: pages.length, readyCount, missingCount: pages.filter((page) => page.status === 'missing').length, warningCount: pages.filter((page) => page.status === 'warning').length } });
  } catch (error) {
    next(error);
  }
});

router.get('/all-reviews-page-setup', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const [acceptedReviews, pendingReviews] = await Promise.all([
      Review.countDocuments({ shopDomain, status: 'accepted', isDeleted: { $ne: true }, isTestReview: { $ne: true } }),
      Review.countDocuments({ shopDomain, status: 'pending', isDeleted: { $ne: true }, isTestReview: { $ne: true } }),
    ]);
    const appUrl = env.appUrl || '';
    const pageChecks = await Promise.all([
      checkShopifyStorefrontPage(shopDomain, 'leave-review', 'Leave Review page'),
      checkShopifyStorefrontPage(shopDomain, 'reviews', 'All Reviews page'),
    ]);
    return res.json({
      ok: true,
      shopDomain,
      appUrl,
      acceptedReviews,
      pendingReviews,
      pageChecks,
      apiEndpoint: `${appUrl}/api/reviews/seo-page?shopDomain=${encodeURIComponent(shopDomain)}&limit=120`,
      recommendedPageHandle: 'reviews',
      themeBlockName: 'All Reviews SEO Page',
      liquidSnippet: `{% render 'all_reviews_seo_page' %}`,
      appBlockInstructions: [
        'Online Store → Themes → Customize.',
        'Open or create a page template for /pages/reviews.',
        'Add the Nectar “All Reviews SEO Page” app block.',
        `Set Nectar app URL to ${appUrl || 'your Render app URL'}.`,
        'Save and preview /pages/reviews.',
      ],
    });
  } catch (error) {
    next(error);
  }
});


router.post('/campaign-reminder', async (req, res, next) => {
  const shopDomain = shopDomainFromReq(req);
  try {
    const email = cleanEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'A valid recipient email is required.' });
    const orderId = cleanText(req.body?.orderId || '', 120);
    const itemId = cleanText(req.body?.itemId || '', 180);
    const productTitle = cleanText(req.body?.productTitle || 'Recent purchase', 180);
    const campaign = cleanText(req.body?.campaign || 'manual_review_reminder', 120);
    const settings = await activeEmailSettings(shopDomain);
    const transporter = createTransporterFromSettings(settings);
    const fromName = settings.fromName || 'Store Reviews';
    const fromEmail = settings.fromEmail || settings.smtpUser;
    let products = itemId ? [{ id: itemId, productId: itemId, title: productTitle }] : [];
    if (!products.length) {
      const job = await ReviewRequestJob.findOne({ shopDomain, customerEmail: email, ...(orderId ? { orderId } : {}) }).sort({ createdAt: -1 }).lean().catch(() => null);
      if (job?.products?.length) products = job.products.map((product) => ({ id: product.productId || product.id, productId: product.productId || product.id, variantId: product.variantId || '', title: product.title || 'Purchased product' })).filter((product) => product.id);
    }
    if (!products.length) {
      const review = await Review.findOne({ shopDomain, email, ...(orderId ? { orderId } : {}) }).sort({ createdAt: -1 }).lean().catch(() => null);
      if (review?.itemId) products = [{ id: review.itemId, productId: review.itemId, title: review.headline || productTitle || 'Recent purchase' }];
    }
    if (!products.length) products = [{ id: `order-${orderId || Date.now()}`, productId: `order-${orderId || Date.now()}`, title: productTitle || 'Recent order' }];
    const token = createReviewToken({ shopDomain, email, customerName: '', orderId, products, expiresDays: 14, testMode: false });
    if (!token) return res.status(400).json({ error: 'Review token could not be created. Set EMAIL_CREDENTIAL_SECRET or SHOPIFY_API_SECRET.' });
    const reviewUrl = `https://${shopDomain}/pages/leave-review?shopDomain=${encodeURIComponent(shopDomain)}&mode=${itemId ? 'product' : 'order'}&order_id=${encodeURIComponent(orderId)}&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}${itemId ? `&product_id=${encodeURIComponent(itemId)}` : ''}`;
    const subject = cleanText(req.body?.subject || 'Quick reminder to leave a review', 160);
    const templateName = cleanText(req.body?.templateName || 'Manual reminder', 160);
    const layoutName = cleanText(req.body?.layoutName || 'reminder', 80);
    const moduleNames = Array.isArray(req.body?.moduleNames) ? req.body.moduleNames.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 20) : ['manual_reminder'];
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#111827;max-width:620px;margin:0 auto;padding:24px;"><h2 style="margin:0 0 10px;">Quick reminder</h2><p style="margin:0 0 18px;color:#4b5563;">We noticed the review request has not been opened yet. You can manually resend this reminder from Nectar.</p><p style="margin:0 0 22px;color:#4b5563;">Order: <strong>${orderId || 'recent order'}</strong></p><a href="${reviewUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:10px;padding:12px 16px;">Leave a review</a><p style="margin:18px 0 0;color:#667085;font-size:12px;">This reminder was sent manually from Nectar.</p></div>`;
    const htmlHash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);
    await transporter.sendMail({
      from: `${fromName.replace(/"/g, '')} <${fromEmail}>`,
      to: email,
      replyTo: settings.replyToEmail || fromEmail,
      subject,
      html,
    });
    await CampaignEvent.create({
      shopDomain,
      campaign,
      eventType: 'sent',
      orderId,
      itemId,
      email,
      token,
      subject,
      templateName,
      layoutName,
      moduleNames,
      htmlHash,
      userAgent: cleanText(req.headers['user-agent'], 500),
    });
    await Settings.findOneAndUpdate({ shopDomain }, { $inc: { emailsSentTotal: 1 }, $setOnInsert: { shopDomain } }, { upsert: true });
    return res.json({ ok: true, message: 'Reminder sent.' });
  } catch (error) {
    next(error);
  }
});

router.post('/test-email', async (req, res, next) => {
  const shopDomain = shopDomainFromReq(req);
  try {
    const to = cleanEmail(req.body.to);
    if (!to) return res.status(400).json({ error: 'A valid recipient email is required.' });
    if (!req.body.html) return res.status(400).json({ error: 'Email HTML is required.' });

    const settings = await EmailProviderSettings.findOne({ shopDomain });
    if (!settings || !settings.enabled || !settings.smtpPassEncrypted) {
      return res.status(400).json({ error: 'Email provider is not configured for this shop.' });
    }

    const smtpHostError = assertValidSmtpHost(settings.smtpHost);
    if (smtpHostError) return res.status(400).json({ error: smtpHostError });

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort || 587),
      secure: settings.secureMode === 'ssl' || Number(settings.smtpPort) === 465,
      requireTLS: settings.secureMode === 'starttls',
      auth: { user: settings.smtpUser, pass: decryptSecret(settings.smtpPassEncrypted) },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });

    const fromName = settings.fromName || 'Store Reviews';
    const fromEmail = settings.fromEmail || settings.smtpUser;
    const orderId = cleanText(req.body.orderId || 'test-1001', 120);
    const itemId = cleanText(req.body.itemId || '', 120);
    const token = cleanText(req.body.token || `test-${Date.now()}`, 200);
    const subject = cleanText(req.body.subject || 'Review request test email', 160);
    const templateName = cleanText(req.body.templateName || '', 160);
    const layoutName = cleanText(req.body.layoutName || '', 80);
    const moduleNames = Array.isArray(req.body.moduleNames) ? req.body.moduleNames.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 20) : [];
    const trackingPixel = `${env.appUrl || ''}/api/campaign/open?shopDomain=${encodeURIComponent(shopDomain)}&campaign=test_review_request&orderId=${encodeURIComponent(orderId)}&email=${encodeURIComponent(to)}&itemId=${encodeURIComponent(itemId)}&token=${encodeURIComponent(token)}&t=${Date.now()}`;
    let html = String(req.body.html || '').slice(0, 200000);
    const htmlHash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);
    if (!html.includes('/api/campaign/open')) {
      html += `<img src="${trackingPixel}" width="1" height="1" alt="" style="display:none;opacity:0;width:1px;height:1px;">`;
    }

    await transporter.sendMail({
      from: `${fromName.replace(/"/g, '')} <${fromEmail}>`,
      to,
      replyTo: settings.replyToEmail || fromEmail,
      subject,
      html,
    });

    await CampaignEvent.create({
      shopDomain,
      campaign: 'test_review_request',
      eventType: 'sent',
      orderId,
      email: to,
      itemId,
      token,
      subject,
      templateName,
      layoutName,
      moduleNames,
      htmlHash,
      userAgent: cleanText(req.headers['user-agent'], 500),
    });
    await Settings.findOneAndUpdate({ shopDomain }, { $inc: { emailsSentTotal: 1 }, $setOnInsert: { shopDomain } }, { upsert: true });

    settings.lastTestedAt = new Date();
    settings.lastTestStatus = 'success';
    settings.lastTestError = '';
    await settings.save();
    return res.json({ ok: true, message: 'Test email sent.' });
  } catch (error) {
    const publicMessage = publicEmailSendError(error);
    await EmailProviderSettings.findOneAndUpdate({ shopDomain }, { $set: { lastTestedAt: new Date(), lastTestStatus: 'failed', lastTestError: publicMessage } }).catch(() => {});
    return res.status(502).json({ error: publicMessage, detail: error.message || 'Failed to send test email' });
  }
});

function e2eCheck(key, label, status, detail, action = '') {
  return { key, label, status, detail, action };
}

function e2eStatusRank(status) {
  return status === 'blocked' ? 3 : status === 'warning' ? 2 : status === 'ready' ? 1 : 0;
}

function e2eHasBlocking(prerequisites = []) {
  return prerequisites.some((item) => item.status === 'blocked');
}

function e2eFakeProducts(body = {}) {
  const input = Array.isArray(body.products) ? body.products : [];
  const products = input.length ? input : [{
    id: 'gid://shopify/Product/999999999001',
    productId: 'gid://shopify/Product/999999999001',
    title: 'Nectar End-to-End Test Product',
    handle: 'nectar-e2e-test-product',
    quantity: 1,
  }];
  return products.slice(0, 10).map((product, index) => ({
    id: cleanText(product.id || product.productId || product.itemId || `gid://shopify/Product/99999999900${index + 1}`, 180),
    productId: cleanText(product.productId || product.id || product.itemId || `gid://shopify/Product/99999999900${index + 1}`, 180),
    itemId: cleanText(product.itemId || product.productId || product.id || `gid://shopify/Product/99999999900${index + 1}`, 180),
    title: cleanText(product.title || `Nectar Test Product ${index + 1}`, 180),
    handle: cleanText(product.handle || `nectar-test-product-${index + 1}`, 180),
    quantity: clampNumber(product.quantity, 1, 99, 1),
  }));
}

function e2eScenarioConfig(rawScenario = 'reviews') {
  const scenario = ['reviews', 'loyalty', 'discounts', 'cart_rewards', 'full_journey'].includes(rawScenario) ? rawScenario : 'reviews';
  return {
    scenario,
    needsReviews: ['reviews', 'loyalty', 'full_journey'].includes(scenario),
    needsEmail: ['reviews', 'loyalty', 'discounts', 'full_journey'].includes(scenario),
    needsDiscounts: ['discounts', 'loyalty', 'cart_rewards', 'full_journey'].includes(scenario),
    needsLoyalty: ['loyalty', 'full_journey'].includes(scenario),
    needsCartRewards: ['cart_rewards', 'full_journey'].includes(scenario),
  };
}

async function getCartRewardReadiness(shopDomain) {
  try {
    const CartRewardCampaign = require('../modules/cart-rewards/models/CartRewardCampaign');
    const active = await CartRewardCampaign.countDocuments({ shopDomain, status: { $in: ['active', 'scheduled', 'draft'] } });
    return { available: true, active };
  } catch (error) {
    return { available: false, active: 0, error: error.message };
  }
}

async function buildE2EReadiness(shopDomain, scenarioRaw = 'reviews') {
  const cfg = e2eScenarioConfig(scenarioRaw);
  const [shop, settings, emailSettings, providers, discountProgram, loyaltyProgram, cartReward] = await Promise.all([
    ensureShop(shopDomain),
    Settings.findOneAndUpdate({ shopDomain }, { $setOnInsert: { shopDomain } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean(),
    EmailProviderSettings.findOne({ shopDomain }).lean(),
    EmailProviderProfile.find({ shopDomain }).lean().catch(() => []),
    getOrCreateDiscountProgram(shopDomain).then((doc) => doc.toObject ? doc.toObject() : doc).catch(() => null),
    getOrCreateLoyaltyProgram(shopDomain).then((doc) => doc.toObject ? doc.toObject() : doc).catch(() => null),
    getCartRewardReadiness(shopDomain),
  ]);

  const prerequisites = [];
  const flowConfirmed = Boolean(settings?.testCentre?.shopifyFlowConfirmed);
  const reviewAutomation = await automationReadiness(shopDomain).catch(() => null);
  const tokenSecretReady = Boolean(env.emailCredentialSecret || env.shopifyApiSecret);
  const activeEmailReady = Boolean(emailSettings?.enabled && emailSettings?.smtpPassEncrypted && emailSettings?.fromEmail);
  const primaryReviewsProvider = providers.find((provider) => Array.isArray(provider.primaryFor) && provider.primaryFor.includes('reviews'));
  const primaryLoyaltyProvider = providers.find((provider) => Array.isArray(provider.primaryFor) && provider.primaryFor.includes('loyalty'));
  const hasOauth = Boolean(shop?.accessTokenEncrypted);

  if (cfg.needsReviews) {
    prerequisites.push(e2eCheck('review_token_secret', 'Signed review links', tokenSecretReady ? 'ready' : 'blocked', tokenSecretReady ? 'Review links can be signed and verified.' : 'No signing secret is available. Set EMAIL_CREDENTIAL_SECRET or SHOPIFY_API_SECRET before review-link tests can work.', 'Set EMAIL_CREDENTIAL_SECRET / SHOPIFY_API_SECRET.'));
    const nativeReady = Boolean(reviewAutomation?.nativeReady);
    const nativeCfg = reviewAutomation?.config || {};
    prerequisites.push(e2eCheck(
      'native_review_scheduler',
      'Nectar 14-day review scheduler',
      nativeReady ? 'ready' : 'blocked',
      nativeReady
        ? `Nectar can create a fake fulfilled order, wait ${nativeCfg.delayDays || 14} days for live orders, then send the review email from your saved provider. Shopify Flow is optional.`
        : 'Native review scheduling is not ready. This needs an active email provider, signed review links, and native automation switched on.',
      'Open Settings → Review automation and keep Native scheduler enabled. Flow is only needed if you prefer merchant-managed automation.'
    ));
    prerequisites.push(e2eCheck(
      'shopify_flow_optional',
      'Shopify Flow optional fallback',
      flowConfirmed ? 'ready' : 'warning',
      flowConfirmed
        ? 'Flow has been marked as installed as an optional fallback.'
        : 'Flow is not required for the Nectar native scheduler. Use Flow only if the merchant wants to own the wait/action in Shopify Admin.',
      'For development stores, use the native fake-order test; Flow can be configured later on a live merchant store.'
    ));
  }

  if (cfg.needsEmail) {
    prerequisites.push(e2eCheck('email_provider', 'Email provider', activeEmailReady ? 'ready' : 'blocked', activeEmailReady ? `Active sender is ${emailSettings.fromEmail || emailSettings.smtpUser}.` : 'No active email provider with a saved password/app password is configured.', 'Open Messaging & Campaigns → Email Delivery and save/test a provider.'));
    if (cfg.needsReviews && primaryReviewsProvider) prerequisites.push(e2eCheck('reviews_primary_sender', 'Reviews primary sender', 'ready', `${primaryReviewsProvider.name || 'Provider'} is assigned as primary for Reviews.`));
    if (cfg.needsLoyalty && primaryLoyaltyProvider) prerequisites.push(e2eCheck('loyalty_primary_sender', 'Loyalty primary sender', 'ready', `${primaryLoyaltyProvider.name || 'Provider'} is assigned as primary for Loyalty.`));
  }

  prerequisites.push(e2eCheck('shopify_oauth', 'Shopify OAuth connection', hasOauth ? 'ready' : 'warning', hasOauth ? 'Shop OAuth token is saved for product lookup and native Shopify calls.' : 'OAuth token is not saved. Fake-order tests can still use sample products, but product search/native Shopify code issuing may not work.', 'Reconnect the app from Shopify Admin if product lookup or native code creation fails.'));

  if (cfg.needsDiscounts) {
    const templates = Array.isArray(discountProgram?.templates) ? discountProgram.templates : [];
    const enabledTemplates = templates.filter((template) => template.enabled !== false);
    const areaTemplates = enabledTemplates.filter((template) => {
      if (cfg.scenario === 'discounts') return ['reviews', 'manual', 'general'].includes(template.area) || template.trigger === 'review_milestone';
      if (cfg.scenario === 'loyalty') return template.area === 'loyalty' || template.trigger === 'loyalty_redemption' || template.trigger === 'checkout_redemption';
      if (cfg.scenario === 'cart_rewards') return template.area === 'cart_rewards' || template.trigger === 'cart_reward_claimed';
      return true;
    });
    const nativeTemplates = areaTemplates.filter((template) => template.method === 'native_shopify_code');
    const scopes = String(shop?.scopes || '');
    const hasDiscountScope = /write_discounts|write_price_rules/.test(scopes) || !nativeTemplates.length;
    prerequisites.push(e2eCheck('discount_module', 'Discount module', discountProgram?.enabled ? 'ready' : 'blocked', discountProgram?.enabled ? 'Discounts module is enabled.' : 'Discounts module is not enabled, so reward-code tests cannot issue/track codes.', 'Open Discounts and enable the module.'));
    prerequisites.push(e2eCheck('discount_template', 'Applicable discount template', areaTemplates.length ? 'ready' : 'blocked', areaTemplates.length ? `${areaTemplates.length} active template(s) can be used for this test.` : 'No active discount template matches this scenario.', 'Create an active Reviews/Loyalty/Cart Rewards discount template.'));
    prerequisites.push(e2eCheck('discount_scopes', 'Native Shopify discount scope', hasDiscountScope ? 'ready' : 'warning', hasDiscountScope ? 'Native-code scope is either present or this test uses draft/reserved codes.' : 'At least one applicable template wants native Shopify codes, but the saved scopes do not show write_discounts/write_price_rules.', 'Use draft mode first or reinstall with discount scopes.'));
  }

  if (cfg.needsLoyalty) {
    const rules = Array.isArray(loyaltyProgram?.pointsRules) ? loyaltyProgram.pointsRules : [];
    const rewards = Array.isArray(loyaltyProgram?.redemptionRewards) ? loyaltyProgram.redemptionRewards : [];
    const reviewRules = rules.filter((rule) => rule.enabled !== false && ['review_submitted', 'review_approved'].includes(rule.trigger));
    const purchaseRules = rules.filter((rule) => rule.enabled !== false && rule.trigger === 'purchase_completed');
    const enabledRewards = rewards.filter((reward) => reward.enabled !== false);
    prerequisites.push(e2eCheck('loyalty_enabled', 'Loyalty programme', loyaltyProgram?.enabled ? 'ready' : 'blocked', loyaltyProgram?.enabled ? 'Loyalty is enabled.' : 'Loyalty is disabled, so points/rewards will not be allocated.', 'Open Loyalty → Settings and enable it.'));
    prerequisites.push(e2eCheck('loyalty_review_rule', 'Review points rule', reviewRules.length ? 'ready' : 'warning', reviewRules.length ? `${reviewRules.length} review rule(s) can award points.` : 'No enabled review-submitted/review-approved points rule exists. Review completion will not award points.', 'Open Loyalty → Points Rules and add/enable a review rule.'));
    prerequisites.push(e2eCheck('loyalty_purchase_rule', 'Purchase earning rule', purchaseRules.length ? 'ready' : 'warning', purchaseRules.length ? `${purchaseRules.length} purchase rule(s) can award points per order spend.` : 'No enabled purchase-completed rule exists. Purchase-point testing will not show points per £/$ yet.', 'Open Loyalty → Points Rules and add a purchase-completed rule with points per currency.'));
    prerequisites.push(e2eCheck('loyalty_reward', 'Redeemable reward', enabledRewards.length ? 'ready' : 'warning', enabledRewards.length ? `${enabledRewards.length} reward(s) are enabled.` : 'No enabled redemption reward exists. Customers can earn points but cannot redeem them yet.', 'Open Loyalty → Rewards and add a reward linked to Discounts.'));
  }

  if (cfg.needsCartRewards) {
    prerequisites.push(e2eCheck('cart_rewards_module', 'Cart rewards module files', cartReward.available ? 'ready' : 'blocked', cartReward.available ? 'Cart Rewards module is available.' : `Cart Rewards module could not be loaded: ${cartReward.error || 'unknown error'}.`, 'Check src/modules/cart-rewards.'));
    prerequisites.push(e2eCheck('cart_rewards_campaign', 'Cart reward campaign', cartReward.active > 0 ? 'ready' : 'warning', cartReward.active > 0 ? `${cartReward.active} campaign(s) exist.` : 'No cart reward campaign exists yet. The storefront cart will not have a reward to show.', 'Open Cart Rewards and create a campaign with at least one tier/reward.'));
  }

  prerequisites.sort((a, b) => e2eStatusRank(b.status) - e2eStatusRank(a.status));
  return { scenario: cfg.scenario, prerequisites, settings, shop, emailSettings, discountProgram, loyaltyProgram, cartReward };
}

function e2eEmailHtml({ shopDomain, customerName, orderId, reviewUrl, scenario, discountCode = '' }) {
  const discountLine = discountCode ? `<p style="margin:0 0 18px;color:#4b5563;">A test discount code has also been generated: <strong>${discountCode}</strong></p>` : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#111827;max-width:640px;margin:0 auto;padding:24px;"><p style="margin:0 0 8px;color:#667085;font-size:13px;font-weight:bold;text-transform:uppercase;">Nectar real-world test</p><h1 style="margin:0 0 12px;font-size:28px;">Review your fake test order</h1><p style="margin:0 0 14px;color:#4b5563;">Hi ${customerName || 'there'}, this is a safe end-to-end test for ${scenario.replace('_', ' ')}. It uses a fake order and will not publish reviews to the storefront.</p><p style="margin:0 0 18px;color:#4b5563;">Fake order: <strong>${orderId}</strong></p>${discountLine}<a href="${reviewUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:10px;padding:13px 18px;">Open customer review page</a><p style="margin:18px 0 0;color:#667085;font-size:12px;">Sent by ${shopDomain}. This is a Nectar test journey; completed reviews are marked as test/spam.</p></div>`;
}


router.get('/review-automation', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const readiness = await automationReadiness(shopDomain);
    const jobs = await ReviewRequestJob.find({ shopDomain }).sort({ createdAt: -1 }).limit(25).lean();
    return res.json({ ok: true, ...readiness, jobs });
  } catch (error) {
    next(error);
  }
});

router.patch('/review-automation', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const body = req.body || {};
    const update = {
      'reviewAutomation.enabled': body.enabled !== false,
      'reviewAutomation.mode': ['native', 'flow', 'manual'].includes(body.mode) ? body.mode : 'native',
      'reviewAutomation.nativeEnabled': body.nativeEnabled !== false,
      'reviewAutomation.flowEnabled': Boolean(body.flowEnabled),
      'reviewAutomation.trigger': ['orders/fulfilled', 'fulfillments/create', 'manual'].includes(body.trigger) ? body.trigger : 'orders/fulfilled',
      'reviewAutomation.deliveryTagRequired': body.deliveryTagRequired !== false,
      'reviewAutomation.deliveryTag': cleanText(body.deliveryTag || 'delivered', 80).toLowerCase(),
      'reviewAutomation.deliveryAnchor': ['fulfilled_at', 'delivered_tag'].includes(body.deliveryAnchor) ? body.deliveryAnchor : 'delivered_tag',
      'reviewAutomation.delayDays': clampNumber(body.delayDays, 0, 365, 14),
      'reviewAutomation.orderCutoffDate': body.orderCutoffDate ? new Date(`${cleanText(body.orderCutoffDate, 10)}T00:00:00.000Z`) : null,
      'reviewAutomation.maxOrderAgeDays': clampNumber(body.maxOrderAgeDays, 0, 3650, 0),
      'reviewAutomation.sendWindowHour': clampNumber(body.sendWindowHour, 0, 23, 10),
      'reviewAutomation.sendWindowTimezone': cleanText(body.sendWindowTimezone || 'store', 80),
      'reviewAutomation.campaign': cleanText(body.campaign || 'native_review_request', 120),
      'reviewAutomation.subject': cleanText(body.subject || 'How was your recent order?', 160),
    };
    await Settings.findOneAndUpdate({ shopDomain }, { $set: update, $setOnInsert: { shopDomain } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const readiness = await automationReadiness(shopDomain);
    return res.json({ ok: true, ...readiness });
  } catch (error) {
    next(error);
  }
});

router.post('/review-automation/register-webhook', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const result = await registerReviewWebhookSubscriptions(shopDomain);
    const readiness = await automationReadiness(shopDomain);
    return res.json({ ok: Boolean(result.ok), result, readiness });
  } catch (error) {
    next(error);
  }
});


function currentWebhookScopeStatus(shop = {}) {
  const combined = String(shop?.scopes || env.shopifyScopes || '');
  const scopes = new Set(combined.split(',').map((scope) => scope.trim()).filter(Boolean));
  return {
    shopifyManagedAppConfig: true,
    rawScopes: Array.from(scopes),
    raw: combined,
  };
}

function buildStoredWebhookMeta(shop = {}) {
  const reviews = shop?.modules?.reviews || {};
  return {
    installedAt: reviews.webhookInstalledAt || null,
    manualConfirmedAt: reviews.webhookManualConfirmedAt || reviews.manualSetupFinalisedAt || null,
    source: reviews.webhookSource || '',
    mode: reviews.webhookMode || '',
    topics: Array.isArray(reviews.webhookTopics) ? reviews.webhookTopics : [],
    addresses: Array.isArray(reviews.webhookAddresses) ? reviews.webhookAddresses : [],
    primaryTopic: reviews.webhookTopic || '',
    primaryAddress: reviews.webhookAddress || '',
    verificationStatus: reviews.webhookVerificationStatus || '',
    verificationCheckedAt: reviews.webhookVerificationCheckedAt || null,
    manualSetupFinalised: Boolean(reviews.manualSetupFinalised),
    registrationResults: Array.isArray(reviews.webhookRegistrationResults) ? reviews.webhookRegistrationResults : [],
    inspectionResults: Array.isArray(reviews.webhookInspectionResults) ? reviews.webhookInspectionResults : [],
    lastWebhookReceivedAt: reviews.lastWebhookReceivedAt || null,
    lastWebhookTopic: reviews.lastWebhookTopic || '',
    lastWebhookId: reviews.lastWebhookId || '',
    lastWebhookOrderId: reviews.lastWebhookOrderId || '',
    lastWebhookOrderName: reviews.lastWebhookOrderName || '',
    lastOrdersFulfilledWebhookAt: reviews.lastOrdersFulfilledWebhookAt || null,
    lastOrdersUpdatedWebhookAt: reviews.lastOrdersUpdatedWebhookAt || null,
    webhookReceiptCount: Number(reviews.webhookReceiptCount || 0),
    ordersFulfilledReceiptCount: Number(reviews.ordersFulfilledReceiptCount || 0),
    ordersUpdatedReceiptCount: Number(reviews.ordersUpdatedReceiptCount || 0),
  };
}

function buildWebhookRegistry({ shopDomain, shop, inspection, updateStored = false }) {
  const stored = buildStoredWebhookMeta(shop || {});
  const scopeStatus = currentWebhookScopeStatus(shop || {});
  const inspectedResults = inspection?.results || [];
  const inspectedByTopic = new Map(inspectedResults.map((item) => [item.topic, item]));
  const storedReady = Boolean(stored.installedAt || stored.primaryAddress || stored.manualSetupFinalised);
  const inspectionUnknown = Boolean(inspection?.skipped || !inspectedResults.length || inspectedResults.every((item) => item.unknown));
  const readAvailable = !inspectionUnknown;
  const lastReceivedByTopic = {
    'orders/fulfilled': stored.lastOrdersFulfilledWebhookAt,
    'orders/updated': stored.lastOrdersUpdatedWebhookAt,
  };
  const receiptCountsByTopic = {
    'orders/fulfilled': stored.ordersFulfilledReceiptCount,
    'orders/updated': stored.ordersUpdatedReceiptCount,
  };
  const webhooks = expectedReviewWebhookSubscriptions().map((expected) => {
    const inspected = inspectedByTopic.get(expected.topic) || null;
    const verified = Boolean(inspected?.ok && inspected?.verifiedInShopify !== false);
    const missing = Boolean(inspected?.missing);
    const unknown = Boolean(inspected?.unknown || inspectionUnknown);
    const isFulfilled = expected.topic === 'orders/fulfilled';
    const receivedAt = lastReceivedByTopic[expected.topic] || null;
    const receivedCount = Number(receiptCountsByTopic[expected.topic] || 0);
    const received = Boolean(receivedAt || receivedCount);
    const status = verified ? 'verified' : received ? 'received' : storedReady ? 'manual_unverified' : missing ? 'missing' : unknown ? 'manual_unverified' : 'missing';
    return {
      key: isFulfilled ? 'orders_fulfilled' : expected.topic.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase(),
      name: isFulfilled ? 'Order fulfillment' : expected.topic === 'orders/updated' ? 'Order update' : expected.topic,
      topic: expected.topic,
      address: expected.address,
      endpoint: expected.address.replace(env.appUrl || '', '') || expected.address,
      format: 'json',
      apiVersion: env.shopifyApiVersion,
      status,
      verifiedInShopify: verified,
      receivedByNectar: received,
      lastReceivedAt: receivedAt,
      receivedCount,
      lastReceivedWebhookId: expected.topic === stored.lastWebhookTopic ? stored.lastWebhookId : '',
      lastReceivedOrderId: expected.topic === stored.lastWebhookTopic ? stored.lastWebhookOrderId : '',
      lastReceivedOrderName: expected.topic === stored.lastWebhookTopic ? stored.lastWebhookOrderName : '',
      storedInNectar: storedReady,
      requiredForLaunch: true,
      purpose: isFulfilled
        ? 'Creates a private review-request job when Shopify marks an order as fulfilled.'
        : 'Updates the job when order tags/status change, including the delivered tag gate.',
      customerJourneyStep: isFulfilled
        ? 'Fulfilled order → Nectar receives webhook → review job is created.'
        : 'Order update/delivered tag → Nectar releases the job into the configured timer.',
      actual: inspected?.actual || null,
      matchingTopicCount: inspected?.matchingTopicCount || 0,
      otherAddressesForTopic: inspected?.otherAddressesForTopic || [],
      reason: verified
        ? 'Found in Shopify and matching Nectar endpoint.'
        : received
          ? 'Nectar has received this webhook from Shopify. This is the strongest proof manual setup is working.'
          : storedReady
            ? 'Manual/config-file webhook setup is finalised internally. Send a Shopify test notification or fulfil/update a test order to confirm delivery into Nectar.'
            : inspected?.reason || 'Expected webhook is not confirmed.',
    };
  });
  const verifiedCount = webhooks.filter((item) => item.verifiedInShopify).length;
  const receivedCount = webhooks.filter((item) => item.receivedByNectar).length;
  const missingCount = webhooks.filter((item) => item.status === 'missing').length;
  const operationalCount = webhooks.filter((item) => item.verifiedInShopify || item.receivedByNectar).length;
  return {
    ok: operationalCount === webhooks.length,
    shopDomain,
    appUrl: env.appUrl || '',
    checkedAt: inspection?.checkedAt || stored.verificationCheckedAt || new Date(),
    readAvailable,
    writeAvailable: false,
    scopeStatus,
    stored,
    summary: {
      expectedCount: webhooks.length,
      verifiedCount,
      receivedCount,
      operationalCount,
      missingCount,
      storedReady,
      status: verifiedCount === webhooks.length ? 'verified' : receivedCount === webhooks.length ? 'received' : storedReady ? 'manual_unverified' : missingCount ? 'attention' : 'unknown',
      message: verifiedCount === webhooks.length
        ? 'All expected review webhooks are visible in Shopify and match Nectar endpoints.'
        : receivedCount === webhooks.length
          ? 'Nectar has received both review webhook events. Manual setup is working.'
          : storedReady
            ? 'Manual webhook setup is finalised in Nectar, but it is not live-verified yet. Refresh from Shopify or send Shopify test notifications to prove both events reach Nectar.'
            : 'Manual webhook setup is not finalised yet. Create the two Shopify webhooks, then finalise manual setup.',
    },
    webhooks,
    rawInspection: inspection || null,
  };
}

async function inspectAndOptionallyPersistWebhookRegistry(shopDomain, { persist = false } = {}) {
  const shop = await Shop.findOne({ shopDomain }).lean();
  const inspection = await inspectReviewWebhookSubscriptions(shopDomain).catch((error) => ({
    ok: false,
    skipped: true,
    reason: error.message || 'Could not inspect Shopify webhooks.',
    results: expectedReviewWebhookSubscriptions().map((hook) => ({ ...hook, ok: false, unknown: true, reason: error.message || 'Inspection failed.' })),
    checkedAt: new Date(),
  }));
  const registry = buildWebhookRegistry({ shopDomain, shop, inspection });
  if (persist) {
    const now = new Date();
    const verified = registry.webhooks.every((item) => item.verifiedInShopify);
    await Shop.findOneAndUpdate({ shopDomain }, {
      $set: {
        'modules.reviews.enabled': true,
        'modules.reviews.webhookInstalledAt': verified ? now : null,
        'modules.reviews.webhookSource': verified ? 'shopify_api_verified' : (registry.summary.storedReady ? registry.stored.source || 'manual_shopify_admin_confirmation' : 'not_verified'),
        'modules.reviews.webhookMode': verified ? 'verified' : (registry.stored.mode || 'manual'),
        'modules.reviews.webhookTopics': registry.webhooks.map((hook) => hook.topic),
        'modules.reviews.webhookAddresses': registry.webhooks.map((hook) => hook.address),
        'modules.reviews.webhookAddress': registry.webhooks.find((hook) => hook.topic === 'orders/fulfilled')?.address || '',
        'modules.reviews.webhookTopic': 'orders/fulfilled',
        'modules.reviews.webhookVerificationStatus': verified ? 'verified' : (registry.summary.storedReady ? 'manual_unverified' : (registry.readAvailable ? 'missing_or_mismatched' : 'manual_unverified')),
        'modules.reviews.webhookVerificationCheckedAt': now,
        'modules.reviews.webhookInspectionResults': registry.webhooks,
      },
      $setOnInsert: { shopDomain },
    }, { upsert: true, setDefaultsOnInsert: true });
  }
  return registry;
}

router.get('/review-automation/webhooks', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const registry = await inspectAndOptionallyPersistWebhookRegistry(shopDomain, { persist: false });
    return res.json(registry);
  } catch (error) {
    next(error);
  }
});

router.post('/review-automation/verify-webhooks', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const registry = await inspectAndOptionallyPersistWebhookRegistry(shopDomain, { persist: true });
    return res.json({ ok: registry.ok, ...registry });
  } catch (error) {
    next(error);
  }
});

router.post('/review-automation/confirm-manual-webhook', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const expectedHooks = expectedReviewWebhookSubscriptions();
    const fulfilledHook = expectedHooks.find((hook) => hook.topic === 'orders/fulfilled') || expectedHooks[0];
    const updatedHook = expectedHooks.find((hook) => hook.topic === 'orders/updated') || expectedHooks[1];

    // If Shopify returns runtime webhook records, verify them; otherwise this remains a config/manual finalisation.
    // If it is not available, still finalise the internal Nectar connection points so
    // manual setup works and the launch checklist reflects the documented setup.
    const inspection = await inspectReviewWebhookSubscriptions(shopDomain).catch((error) => ({
      ok: false,
      skipped: true,
      reason: error.message || 'Could not inspect Shopify webhooks.',
      results: expectedHooks.map((hook) => ({ ...hook, ok: false, unknown: true })),
    }));

    const now = new Date();
    const verificationStatus = inspection.ok ? 'verified' : (inspection.skipped ? 'manual_unverified' : 'manual_confirmed_not_verified');
    
    const existingSettings = await Settings.findOne({ shopDomain }).lean().catch(() => null);
    const existingAuto = existingSettings?.reviewAutomation || {};
    const settingsSet = {};
    if (existingAuto.enabled === undefined) settingsSet['reviewAutomation.enabled'] = true;
    if (existingAuto.nativeEnabled === undefined) settingsSet['reviewAutomation.nativeEnabled'] = true;
    if (!existingAuto.mode) settingsSet['reviewAutomation.mode'] = 'native';
    if (!existingAuto.trigger) settingsSet['reviewAutomation.trigger'] = 'orders/fulfilled';
    if (existingAuto.delayDays === undefined || existingAuto.delayDays === null) settingsSet['reviewAutomation.delayDays'] = 14;
    if (existingAuto.deliveryTagRequired === undefined) settingsSet['reviewAutomation.deliveryTagRequired'] = true;
    if (!existingAuto.deliveryTag) settingsSet['reviewAutomation.deliveryTag'] = 'delivered';
    if (!existingAuto.deliveryAnchor) settingsSet['reviewAutomation.deliveryAnchor'] = 'delivered_tag';
    if (!existingAuto.campaign) settingsSet['reviewAutomation.campaign'] = 'native_review_request';
    if (!existingAuto.subject) settingsSet['reviewAutomation.subject'] = 'How was your recent order?';

    if (Object.keys(settingsSet).length) {
      await Settings.findOneAndUpdate(
        { shopDomain },
        { $set: settingsSet, $setOnInsert: { shopDomain } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    await Shop.findOneAndUpdate(
      { shopDomain },
      {
        $set: {
          'modules.reviews.enabled': true,
          'modules.reviews.webhookInstalledAt': inspection.ok ? now : null,
          'modules.reviews.webhookManualConfirmedAt': now,
          'modules.reviews.webhookSource': 'manual_shopify_admin_confirmation',
          'modules.reviews.webhookMode': 'manual',
          'modules.reviews.webhookTopics': expectedHooks.map((hook) => hook.topic),
          'modules.reviews.webhookAddresses': expectedHooks.map((hook) => hook.address),
          'modules.reviews.webhookAddress': fulfilledHook?.address || '',
          'modules.reviews.webhookTopic': 'orders/fulfilled',
          'modules.reviews.webhookVerificationStatus': verificationStatus,
          'modules.reviews.webhookVerificationCheckedAt': now,
          'modules.reviews.webhookInspectionResults': inspection.results || [],
          'modules.reviews.manualSetupFinalised': true,
          'modules.reviews.manualSetupFinalisedAt': now,
        },
        $setOnInsert: { shopDomain },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const readiness = await automationReadiness(shopDomain);
    return res.json({
      ok: true,
      confirmed: true,
      manualFinalised: true,
      verificationStatus,
      verifiedInShopify: Boolean(inspection.ok),
      inspection,
      readiness,
      webhookRegistry: buildWebhookRegistry({ shopDomain, shop: await Shop.findOne({ shopDomain }).lean(), inspection }),
      addresses: {
        fulfilledAddress: fulfilledHook?.address || '',
        updatedAddress: updatedHook?.address || '',
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/review-automation/fake-order', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const order = {
      id: req.body?.orderId || `NECTAR-TEST-${Date.now().toString().slice(-6)}`,
      name: req.body?.orderName || req.body?.orderId || `NECTAR-TEST-${Date.now().toString().slice(-6)}`,
      email: req.body?.email || req.body?.recipientEmail || '',
      customer: { first_name: req.body?.customerName || 'Nectar', last_name: 'Test Customer', email: req.body?.email || req.body?.recipientEmail || '' },
      fulfilled_at: req.body?.fulfilledAt || new Date().toISOString(),
      line_items: Array.isArray(req.body?.products) && req.body.products.length ? req.body.products : [{ product_id: 999999999001, variant_id: 999999999002, title: 'Nectar fake-order product', quantity: 1 }],
    };
    const delayDays = req.body?.sendNow ? 0 : req.body?.delayDays;
    const job = await scheduleReviewRequestFromOrder({ shopDomain, order: { ...order, delivered: true }, source: 'admin_fake_order', delayDays, testMode: true, webhookId: `fake-${Date.now()}` });
    let sendResult = null;
    if (req.body?.sendNow) {
      await ReviewRequestJob.updateOne({ _id: job._id }, { $set: { status: 'scheduled', scheduledAt: new Date(Date.now() - 5000), blockedReason: '' } });
      sendResult = await sendDueReviewRequests({ limit: 1, jobId: job._id });
    }
    const refreshed = await ReviewRequestJob.findById(job._id).lean();
    return res.status(201).json({ ok: true, job: refreshed || job, sendResult });
  } catch (error) {
    const publicMessage = publicEmailSendError(error);
    return res.status(error.statusCode || 502).json({ error: publicMessage, detail: error.message || 'Fake-order email failed' });
  }
});

router.post('/review-automation/run-due', async (req, res, next) => {
  try {
    const result = await sendDueReviewRequests({ limit: clampNumber(req.body?.limit, 1, 50, 10) });
    return res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.get('/review-automation/outstanding', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const snapshot = await outstandingReviewAutomationSnapshot(shopDomain);
    return res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

router.post('/review-automation/process-outstanding', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const now = new Date();
    const retryFailed = req.body?.retryFailed !== false;
    let retriedFailed = 0;
    if (retryFailed) {
      const retry = await ReviewRequestJob.updateMany(
        { shopDomain, status: 'failed', testMode: { $ne: true }, customerEmail: { $ne: '' } },
        { $set: { status: 'scheduled', scheduledAt: new Date(now.getTime() - 5000), blockedReason: '', errorMessage: '', lastManualRetryAt: now }, $inc: { manualRetryCount: 1 } }
      );
      retriedFailed = retry.modifiedCount || 0;
    }
    const result = await sendDueReviewRequests({ limit: clampNumber(req.body?.limit, 1, 100, 50) });
    const snapshot = await outstandingReviewAutomationSnapshot(shopDomain);
    return res.json({ ok: true, retriedFailed, processed: result.count || 0, result, outstanding: snapshot });
  } catch (error) {
    next(error);
  }
});

router.post('/review-automation/jobs/:jobId/manual-send', async (req, res, next) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirmation is required before emailing a customer manually.' });
    const shopDomain = shopDomainFromReq(req);
    const sourceJob = await ReviewRequestJob.findOne({ _id: req.params.jobId, shopDomain }).lean();
    const result = await manualSendReviewJobToCustomer({ shopDomain, sourceJob, bypassDelivery: Boolean(req.body?.bypassDelivery) });
    const snapshot = await outstandingReviewAutomationSnapshot(shopDomain);
    return res.status(201).json({ ...result, outstanding: snapshot });
  } catch (error) {
    const publicMessage = publicEmailSendError(error);
    return res.status(error.statusCode || 502).json({ error: publicMessage, detail: error.message || 'Manual review email send failed' });
  }
});

router.post('/review-automation/jobs/:jobId/send-proof', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const sourceJob = await ReviewRequestJob.findOne({ _id: req.params.jobId, shopDomain }).lean();
    if (!sourceJob) return res.status(404).json({ error: 'Review request job not found for this shop.' });
    const result = await sendReviewProofForSourceJob({ shopDomain, sourceJob });
    return res.status(201).json(result);
  } catch (error) {
    const publicMessage = publicEmailSendError(error);
    return res.status(error.statusCode || 502).json({ error: publicMessage, detail: error.message || 'Shop proof email failed' });
  }
});

router.post('/review-automation/send-proof-latest', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    let sourceJob = await ReviewRequestJob.findOne({ shopDomain, testMode: { $ne: true } }).sort({ createdAt: -1 }).lean();
    if (!sourceJob) {
      sourceJob = {
        _id: `manual-${Date.now()}`,
        orderId: `NECTAR-PROOF-SAMPLE-${Date.now().toString().slice(-6)}`,
        orderName: 'Sample proof order',
        customerEmail: '',
        customerName: 'Shop Proof',
        products: [{ id: 'sample-proof-product', title: 'Sample review proof product', quantity: 1 }],
      };
    }
    const result = await sendReviewProofForSourceJob({ shopDomain, sourceJob });
    return res.status(201).json(result);
  } catch (error) {
    const publicMessage = publicEmailSendError(error);
    return res.status(error.statusCode || 502).json({ error: publicMessage, detail: error.message || 'Latest shop proof email failed' });
  }
});

router.get('/e2e-tests', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const scenario = cleanText(req.query.scenario || 'reviews', 40);
    const readiness = await buildE2EReadiness(shopDomain, scenario);
    const history = await E2ETestRun.find({ shopDomain }).sort({ createdAt: -1 }).limit(20).lean();
    return res.json({
      ok: true,
      scenario: readiness.scenario,
      flowConfirmed: Boolean(readiness.settings?.testCentre?.shopifyFlowConfirmed),
      flowConfirmedAt: readiness.settings?.testCentre?.flowConfirmedAt || null,
      prerequisites: readiness.prerequisites,
      history,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/e2e-tests/settings', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const flowConfirmed = Boolean(req.body?.shopifyFlowConfirmed);
    const updated = await Settings.findOneAndUpdate(
      { shopDomain },
      {
        $set: {
          shopDomain,
          'testCentre.shopifyFlowConfirmed': flowConfirmed,
          'testCentre.flowConfirmedAt': flowConfirmed ? new Date() : null,
          'testCentre.flowConfirmedBy': cleanEmail(req.body?.confirmedBy || ''),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ ok: true, testCentre: updated.testCentre || {} });
  } catch (error) {
    next(error);
  }
});

router.post('/e2e-tests/run', async (req, res, next) => {
  const shopDomain = shopDomainFromReq(req);
  try {
    const scenario = cleanText(req.body?.scenario || 'reviews', 40);
    const validationOnly = Boolean(req.body?.validationOnly);
    const readiness = await buildE2EReadiness(shopDomain, scenario);
    const recipientEmail = cleanEmail(req.body?.email || req.body?.recipientEmail || readiness.emailSettings?.fromEmail || '');
    const fakeOrderId = cleanText(req.body?.orderId || `NECTAR-TEST-${Date.now().toString().slice(-6)}`, 120);
    const fakeCustomerName = cleanText(req.body?.customerName || 'Nectar Test Customer', 120);
    const products = e2eFakeProducts(req.body || {});
    const blocked = e2eHasBlocking(readiness.prerequisites);
    const steps = [
      { key: 'fake_order', label: 'Create fake order context', status: 'ready', detail: `Prepared fake order ${fakeOrderId} with ${products.length} product(s).` },
      { key: 'customer_email', label: 'Send customer email', status: readiness.prerequisites.find((p) => p.key === 'email_provider')?.status || 'ready', detail: 'Uses the same sender path as live review/reward messages.' },
      { key: 'customer_action', label: 'Customer completes journey', status: 'awaiting', detail: 'Customer opens the fake-order link and submits the review/reward action.' },
      { key: 'admin_result', label: 'Result returns to admin', status: 'awaiting', detail: 'The resulting review/code/ledger entry is visible in the admin area and marked as a test.' },
    ];

    if (validationOnly || blocked) {
      const run = await E2ETestRun.create({
        shopDomain,
        scenario: readiness.scenario,
        status: blocked ? 'blocked' : 'validated',
        recipientEmail,
        fakeOrderId,
        fakeCustomerName,
        prerequisites: readiness.prerequisites,
        steps: blocked ? steps.map((step) => ({ ...step, status: step.status === 'awaiting' ? 'blocked' : step.status })) : steps,
        blockedReason: blocked ? readiness.prerequisites.filter((item) => item.status === 'blocked').map((item) => item.label).join(', ') : '',
        artifacts: { products, validationOnly },
      });
      return res.status(200).json({ ok: !blocked, status: run.status, run, prerequisites: readiness.prerequisites, steps: run.steps });
    }

    if (!recipientEmail) return res.status(400).json({ error: 'A recipient email is required for a real-world test email.' });

    let reviewToken = '';
    let reviewUrl = '';
    let discountCode = '';
    let discountIssueId = '';
    let loyaltyLedgerId = '';

    if (e2eScenarioConfig(scenario).needsReviews) {
      reviewToken = createReviewToken({ shopDomain, email: recipientEmail, customerName: fakeCustomerName, orderId: fakeOrderId, products, expiresDays: 14, testMode: true });
      if (!reviewToken) return res.status(500).json({ error: 'Could not create signed review token. Check EMAIL_CREDENTIAL_SECRET or SHOPIFY_API_SECRET.' });
      reviewUrl = `https://${shopDomain}/pages/leave-review?shopDomain=${encodeURIComponent(shopDomain)}&mode=order&order_id=${encodeURIComponent(fakeOrderId)}&email=${encodeURIComponent(recipientEmail)}&token=${encodeURIComponent(reviewToken)}&test=1`;
    }

    if (e2eScenarioConfig(scenario).needsDiscounts) {
      const issue = await issueDiscountCode({
        shopDomain,
        area: scenario === 'cart_rewards' ? 'cart_rewards' : scenario === 'loyalty' ? 'loyalty' : 'reviews',
        trigger: scenario === 'loyalty' ? 'loyalty_redemption' : scenario === 'cart_rewards' ? 'cart_reward_claimed' : 'review_milestone',
        sourceId: fakeOrderId,
        email: recipientEmail,
        override: { privateNote: `End-to-end fake-order test for ${scenario}.`, code: undefined },
      });
      discountCode = issue.code || '';
      discountIssueId = String(issue._id || '');
    }

    if (e2eScenarioConfig(scenario).needsLoyalty) {
      const ref = normaliseCustomerRef({ shopDomain, email: recipientEmail });
      if (ref) {
        const ledger = await createLedgerEntry({
          shopDomain,
          customerRefHash: ref,
          customerRefHint: customerHintFromHash(ref),
          eventType: 'manual_adjustment',
          source: 'e2e_fake_order',
          points: 100,
          status: 'available',
          availableAt: new Date(),
          awardedAt: new Date(),
          ruleId: 'e2e_fake_order',
          ruleName: 'End-to-end fake-order test',
          privateNote: `Safe test ledger entry generated for ${fakeOrderId}.`,
        });
        loyaltyLedgerId = String(ledger._id || '');
      }
    }

    const settings = await activeEmailSettings(shopDomain);
    const transporter = createTransporterFromSettings(settings);
    const fromName = settings.fromName || 'Store Reviews';
    const fromEmail = settings.fromEmail || settings.smtpUser;
    const subject = cleanText(req.body?.subject || `Nectar test journey for ${fakeOrderId}`, 160);
    const html = e2eEmailHtml({ shopDomain, customerName: fakeCustomerName, orderId: fakeOrderId, reviewUrl: reviewUrl || `https://${shopDomain}`, scenario: readiness.scenario, discountCode });
    const htmlHash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);

    await transporter.sendMail({ from: `${fromName.replace(/"/g, '')} <${fromEmail}>`, to: recipientEmail, replyTo: settings.replyToEmail || fromEmail, subject, html });
    await CampaignEvent.create({
      shopDomain,
      campaign: `e2e_${readiness.scenario}`,
      eventType: 'sent',
      orderId: fakeOrderId,
      email: recipientEmail,
      itemId: products[0]?.itemId || products[0]?.productId || '',
      token: reviewToken || `e2e-${Date.now()}`,
      subject,
      templateName: 'E2E fake-order journey',
      layoutName: readiness.scenario,
      moduleNames: ['fake_order', readiness.scenario],
      htmlHash,
      userAgent: cleanText(req.headers['user-agent'], 500),
    });
    await Settings.findOneAndUpdate({ shopDomain }, { $inc: { emailsSentTotal: 1 }, $set: { 'testCentre.lastScenario': readiness.scenario }, $setOnInsert: { shopDomain } }, { upsert: true });

    const runSteps = [
      { key: 'fake_order', label: 'Fake order created', status: 'complete', detail: `${fakeOrderId} created inside Nectar only. No Shopify order was created.` },
      { key: 'review_link', label: 'Signed customer link created', status: reviewUrl ? 'complete' : 'skipped', detail: reviewUrl ? 'The link opens the customer review page with a signed test token.' : 'No review link was needed for this scenario.' },
      { key: 'discount_code', label: 'Discount code reserved/issued', status: discountCode ? 'complete' : 'skipped', detail: discountCode ? `${discountCode} created and tracked in the Discounts module.` : 'No discount code was needed for this scenario.' },
      { key: 'loyalty_entry', label: 'Loyalty ledger simulated', status: loyaltyLedgerId ? 'complete' : 'skipped', detail: loyaltyLedgerId ? 'A safe test ledger entry was created against a hashed fake customer reference.' : 'No loyalty ledger entry was needed for this scenario.' },
      { key: 'email_sent', label: 'Customer email sent', status: 'complete', detail: `Sent to ${recipientEmail}.` },
      { key: 'awaiting_customer', label: 'Waiting for customer action', status: 'awaiting', detail: 'Open the email, follow the customer link, and submit the review/reward action. Test reviews never publish live.' },
    ];

    const run = await E2ETestRun.create({
      shopDomain,
      scenario: readiness.scenario,
      status: 'awaiting_customer',
      recipientEmail,
      fakeOrderId,
      fakeCustomerName,
      reviewToken,
      reviewUrl,
      discountCode,
      prerequisites: readiness.prerequisites,
      steps: runSteps,
      artifacts: { products, discountIssueId, loyaltyLedgerId, htmlHash },
    });
    return res.status(201).json({ ok: true, status: run.status, run, prerequisites: readiness.prerequisites, steps: runSteps });
  } catch (error) {
    await E2ETestRun.create({
      shopDomain,
      scenario: cleanText(req.body?.scenario || 'reviews', 40),
      status: 'failed',
      recipientEmail: cleanEmail(req.body?.email || req.body?.recipientEmail || ''),
      fakeOrderId: cleanText(req.body?.orderId || '', 120),
      prerequisites: [],
      steps: [{ key: 'failed', label: 'Test failed', status: 'failed', detail: error.message || 'Unknown error' }],
      blockedReason: error.message || 'Unknown error',
    }).catch(() => {});
    next(error);
  }
});


router.get('/metafields', async (req, res, next) => {
  try {
    const query = `{
      metafieldDefinitions(first: 100, ownerType: PRODUCT) {
        edges { node { namespace key name } }
      }
    }`;
    const json = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/graphql.json`, {
      shopDomain: shopDomainFromReq(req),
      method: 'POST',
      body: JSON.stringify({ query }),
    });
    const mapped = json.data?.metafieldDefinitions?.edges?.map((edge) => ({
      key: `${edge.node.namespace}.${edge.node.key}`,
      name: edge.node.name,
    })) || [];
    return res.json(mapped);
  } catch (error) {
    console.warn('Metafield fetch failed:', error.message);
    return res.json([]);
  }
});


router.get('/shopify-status', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const token = await getAccessTokenForShop(shopDomain);
    return res.json({
      ok: true,
      shopDomain,
      connected: Boolean(token),
      installUrl: buildInstallUrl(shopDomain),
      message: token ? 'Shopify products are connected.' : 'Connect this shop through Shopify OAuth to enable product search and product images.',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/products/search', async (req, res, next) => {
  try {
    const queryText = cleanText(req.query.q, 120).toLowerCase();
    if (!queryText) return res.json({ products: [] });

    const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products.json?limit=250&fields=id,title,handle,image,variants,tags`, { shopDomain: shopDomainFromReq(req) });
    if (!data) {
      return res.json({
        products: [],
        unavailable: true,
        requiresOauth: true,
        installUrl: buildInstallUrl(shopDomainFromReq(req)),
        message: 'Connect this shop through Shopify OAuth to enable product search. No global Render token is required.',
      });
    }

    const products = (data.products || [])
      .filter((product) => String(product.title || '').toLowerCase().includes(queryText) || String(product.handle || '').toLowerCase().includes(queryText) || String(product.id || '').includes(queryText))
      .slice(0, 10)
      .map((product) => ({
        id: String(product.id || ''),
        title: product.title || 'Product',
        handle: product.handle || '',
        image: product.image?.src || '',
        variantId: product.variants?.[0]?.id ? String(product.variants[0].id) : '',
        price: product.variants?.[0]?.price ? Number(product.variants[0].price) : 0,
        inventoryQuantity: Number(product.variants?.[0]?.inventory_quantity || 0),
        vendor: product.vendor || '',
        quantity: 1,
        tags: typeof product.tags === 'string' ? product.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
        metafields: {},
      }));
    return res.json({ products });
  } catch (error) {
    next(error);
  }
});


router.get('/review-launch-checklist', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const [readiness, settings, emailSettings, providers, shop, recentJobs, totalReviews, pendingReviews, acceptedReviews] = await Promise.all([
      automationReadiness(shopDomain),
      Settings.findOne({ shopDomain }).lean(),
      EmailProviderSettings.findOne({ shopDomain }).lean(),
      EmailProviderProfile.find({ shopDomain }).lean().catch(() => []),
      Shop.findOne({ shopDomain }).lean(),
      ReviewRequestJob.find({ shopDomain }).sort({ createdAt: -1 }).limit(10).lean(),
      Review.countDocuments({ shopDomain, isDeleted: { $ne: true }, isTestReview: { $ne: true } }),
      Review.countDocuments({ shopDomain, status: 'pending', isDeleted: { $ne: true } }),
      Review.countDocuments({ shopDomain, status: 'accepted', isDeleted: { $ne: true } }),
    ]);

    const emailReady = Boolean(emailSettings?.enabled && emailSettings?.smtpPassEncrypted && (emailSettings?.fromEmail || emailSettings?.smtpUser));
    const primaryReviewsProvider = providers.find((provider) => Array.isArray(provider.primaryFor) && provider.primaryFor.includes('reviews'));
    const oauthReady = Boolean(shop?.accessTokenEncrypted || env.shopifyAccessToken);
    const tokenReady = Boolean(env.emailCredentialSecret || env.shopifyApiSecret);
    const auto = settings?.reviewAutomation || {};
    const nativeReady = Boolean(auto.enabled !== false && auto.nativeEnabled !== false && emailReady && tokenReady);
    const webhookMeta = shop?.modules?.reviews || {};
    const webhookVerificationStatus = webhookMeta.webhookVerificationStatus || '';
    const webhookProblem = ['failed', 'missing_or_mismatched', 'manual_confirmed_not_verified', 'manual_unverified'].includes(webhookVerificationStatus);
    const webhookReceivedReady = Boolean(webhookMeta.lastOrdersFulfilledWebhookAt && webhookMeta.lastOrdersUpdatedWebhookAt);
    const webhookReady = (webhookVerificationStatus === 'verified' || webhookReceivedReady) && !webhookProblem;
    const webhookManual = webhookMeta.webhookSource === 'manual_shopify_admin_confirmation';
    const latestJob = recentJobs[0] || null;
    const proofRecipient = lockedReviewProofRecipient(emailSettings, settings);
    const outstandingSnapshot = await outstandingReviewAutomationSnapshot(shopDomain);

    const checks = [
      {
        key: 'email_provider',
        label: 'Reviews email sender',
        status: emailReady ? 'ready' : 'blocked',
        detail: emailReady ? `Emails can send from ${emailSettings.fromEmail || emailSettings.smtpUser}.` : 'Save an email provider with SMTP/app-password details before going live.',
        action: emailReady ? '' : 'Open Messaging & Campaigns → Email Delivery.',
        target: 'v-msg:delivery',
      },
      {
        key: 'primary_provider',
        label: 'Primary provider for Reviews',
        status: primaryReviewsProvider ? 'ready' : (emailReady ? 'warning' : 'blocked'),
        detail: primaryReviewsProvider ? `${primaryReviewsProvider.name || 'Provider'} is primary for Reviews.` : 'A provider is saved, but none is marked primary for Reviews yet.',
        action: primaryReviewsProvider ? '' : 'Mark the saved provider as Primary: Reviews.',
        target: 'v-msg:delivery',
      },
      {
        key: 'signed_links',
        label: 'Signed one-use review links',
        status: tokenReady ? 'ready' : 'blocked',
        detail: tokenReady ? 'Unique order-review links can be signed and verified.' : 'Set EMAIL_CREDENTIAL_SECRET or SHOPIFY_API_SECRET in Render so links cannot be forged.',
        action: tokenReady ? '' : 'Add EMAIL_CREDENTIAL_SECRET in Render environment variables.',
        target: 'v-settings',
      },
      {
        key: 'shopify_oauth',
        label: 'Shopify connection',
        status: oauthReady ? 'ready' : 'blocked',
        detail: oauthReady ? 'OAuth is connected, so Nectar can register order webhooks and search products.' : 'OAuth is not connected for this shop. Real fulfilled orders will not create review jobs yet.',
        action: oauthReady ? '' : 'Open the app from Shopify Admin and complete OAuth.',
        target: 'v-settings',
      },
      {
        key: 'orders_fulfilled_webhook',
        label: 'Fulfilled-order webhook',
        status: webhookReady ? 'ready' : (oauthReady ? 'warning' : 'blocked'),
        detail: webhookReady
          ? (webhookManual
            ? `Manual Shopify webhooks are working${webhookReceivedReady ? ' because Nectar received both expected events' : ''}.`
            : `Webhook registered${webhookMeta.webhookTopic ? ` for ${webhookMeta.webhookTopic}` : ''}.`)
          : 'Webhook setup is not live-verified yet. Manual finalise stores the setup, but Refresh from Shopify or a Shopify test notification must prove the events reach Nectar.',
        action: webhookReady ? '' : 'Click Register now, or use Finalise manual setup if you created the webhooks in Shopify Admin.',
        target: 'v-review-launch:register-webhook',
      },
      {
        key: 'native_scheduler',
        label: 'Native 14-day scheduler',
        status: nativeReady ? 'ready' : 'blocked',
        detail: nativeReady ? `Nectar waits ${Number(auto.delayDays ?? 14)} days after fulfilment, then sends automatically.` : 'Native scheduler is not ready. Check sender, signed links and scheduler settings.',
        action: nativeReady ? '' : 'Keep mode set to Native and delay set to 14 days.',
        target: 'v-review-launch',
      },
      {
        key: 'order_age_gate',
        label: 'Old-order review-request safety',
        status: (auto.orderCutoffDate || Number(auto.maxOrderAgeDays || 0) > 0) ? 'ready' : 'warning',
        detail: (auto.orderCutoffDate || Number(auto.maxOrderAgeDays || 0) > 0)
          ? `Old orders are protected${auto.orderCutoffDate ? ` before ${new Date(auto.orderCutoffDate).toISOString().slice(0, 10)}` : ''}${Number(auto.maxOrderAgeDays || 0) > 0 ? ` and after ${Number(auto.maxOrderAgeDays)} days of age` : ''}.`
          : 'No old-order cutoff is configured. Add a date and/or maximum order age before launching customer sends.',
        action: (auto.orderCutoffDate || Number(auto.maxOrderAgeDays || 0) > 0) ? '' : 'Set an order cutoff date or maximum order age in the Reviews Portal safety controls.',
        target: 'v-review-launch',
      },
      {
        key: 'theme_widget',
        label: 'Storefront review blocks',
        status: 'manual',
        detail: 'Add the Customer Reviews and Product Card Stars app blocks to the live theme, or use the Liquid snippets shown in Settings.',
        action: 'Open Reviews Visual Customiser and Manual Setup.',
        target: 'v-style',
      },
      {
        key: 'discounts',
        label: 'Discounts kept off for review launch',
        status: 'info',
        detail: 'Discounts, Loyalty, Cart Rewards and Referrals can stay disabled while Reviews goes live. Basic Shopify stores can launch reviews without discount automation.',
        action: 'Turn discounts on later after a native-code test succeeds.',
        target: 'v-discounts',
      },
    ];

    return res.json({
      ok: true,
      shopDomain,
      recommendedMode: 'reviews_launch_native_scheduler',
      summary: {
        ready: checks.every((check) => !['blocked'].includes(check.status)),
        blockers: checks.filter((check) => check.status === 'blocked').length,
        warnings: checks.filter((check) => check.status === 'warning').length,
        delayDays: Number(auto.delayDays ?? 14),
        orderCutoffDate: auto.orderCutoffDate ? new Date(auto.orderCutoffDate).toISOString().slice(0, 10) : '',
        maxOrderAgeDays: Number(auto.maxOrderAgeDays || 0),
        totalReviews,
        pendingReviews,
        acceptedReviews,
        proofRecipient,
        proofRecipientLocked: Boolean(proofRecipient),
        latestJob: latestJob ? { status: latestJob.status, orderId: latestJob.orderId, scheduledAt: latestJob.scheduledAt, sentAt: latestJob.sentAt, blockedReason: latestJob.blockedReason || latestJob.errorMessage || '' } : null,
        outstandingDueNow: outstandingSnapshot.dueNow,
        outstandingFailed: outstandingSnapshot.failed,
        outstandingBlocked: outstandingSnapshot.blocked,
        outstandingAwaitingDelivery: outstandingSnapshot.awaitingDelivery,
        outstandingActionable: outstandingSnapshot.actionable,
      },
      outstanding: outstandingSnapshot,
      checks,
      webhookRegistry: buildWebhookRegistry({ shopDomain, shop, inspection: { results: webhookMeta.webhookInspectionResults || [], skipped: !webhookMeta.webhookInspectionResults?.length, checkedAt: webhookMeta.webhookVerificationCheckedAt || null } }),
      recentJobs: recentJobs.map((job) => ({
        id: String(job._id),
        status: job.status,
        orderId: job.orderName || job.orderId,
        email: job.customerEmail,
        productCount: Array.isArray(job.products) ? job.products.length : 0,
        scheduledAt: job.scheduledAt,
        sentAt: job.sentAt,
        blockedReason: job.blockedReason || job.errorMessage || '',
        testMode: Boolean(job.testMode),
      })),
      livePath: [
        'Customer order is fulfilled in Shopify.',
        'Shopify sends an orders/fulfilled webhook to Nectar.',
        'Nectar creates a private review-request job only if the order passes the configured age/cutoff safety rules.',
        'Nectar waits the configured delay, normally 14 days.',
        'Nectar sends the review request from the saved Reviews email provider.',
        'The customer submits through a signed one-use order link.',
        'The review lands in Review Manager for approval.',
      ],
    });
  } catch (error) {
    next(error);
  }
});


function fallbackContextAssistant({ message = '', activeView = '', activeProduct = '', pageTitle = '' }) {
  const q = String(message || '').toLowerCase();
  const view = String(activeView || '').toLowerCase();
  const product = String(activeProduct || '').toLowerCase();
  if (view.includes('migration') || view.includes('import') || q.includes('migration') || q.includes('import')) {
    return 'Migration Centre is the safe migration workspace. Keep Yotpo/Shop/old reviews live first, upload the CSV into staging, review which rows are matched product reviews versus site/shop reviews, manually map unmatched products, then import accepted rows. The storefront scanner is a monitoring tool: it checks public pages for review/schema signals but does not pull private Shop/Yotpo review databases.';
  }
  if (view.includes('review-launch') || q.includes('webhook') || q.includes('go live')) {
    return 'The Reviews Launch Checklist is a go/no-go screen. It checks Nectar settings and Shopify-facing setup: saved email provider, primary Reviews sender, signed-link secret, OAuth connection, registered webhook, and native scheduler. The webhook turns green when Nectar successfully registers it with Shopify and stores that success for the shop. Theme placement remains manual because Shopify cannot confirm your preferred visual placement automatically.';
  }
  if (view.includes('msg') || q.includes('email') || q.includes('reminder')) {
    return 'Messaging & Campaigns manages review emails, sender setup, tracking analytics, modules and manual reminders. If reminders fail, check Email Delivery is enabled with a saved SMTP/app password and set EMAIL_CREDENTIAL_SECRET or SHOPIFY_API_SECRET so Nectar can create signed one-use review links.';
  }
  if (view.includes('cart-rewards') || product.includes('cart')) {
    return 'Cart Rewards is a beta product area. Create campaigns, attach Shopify reward products to tiers, schedule campaigns in the calendar, style the cart display in Design, and keep the module amber until a real cart/storefront test succeeds.';
  }
  if (view.includes('loyalty') || product.includes('loyalty')) {
    return 'Loyalty is a beta product area. Configure points rules, tiers, rewards, email copy, and checkout redemption separately. Orange means the module is enabled but not fully live-ready yet; green should only be used when its own checkout/discount/Shopify tests pass.';
  }
  return `You are on ${pageTitle || activeView || 'the admin page'}. Green dots mean live-ready checks passed, orange means enabled but not fully live, no dot means disabled/not enabled, and Beta/Soon pills show maturity. Ask about a specific button or error and I can explain the next step.`;
}

function callOpenAiForContextAssistant({ message, activeView, activeProduct, pageTitle, pageSummary }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return Promise.resolve(null);
  const model = process.env.OPENAI_ASSISTANT_MODEL || process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const https = require('https');
  const payload = JSON.stringify({
    model,
    input: [
      { role: 'system', content: 'You are the embedded Nectar Reviews admin helper. Give practical, concise guidance based only on the supplied page context. Explain what things do, what may be missing, and the next safe action. Do not invent unavailable integrations. Mention when a check is internal versus Shopify-facing.' },
      { role: 'user', content: JSON.stringify({ message, activeView, activeProduct, pageTitle, pageSummary }).slice(0, 12000) },
    ],
    max_output_tokens: 450,
  });
  return new Promise((resolve) => {
    const req = https.request({
      method: 'POST',
      hostname: 'api.openai.com',
      path: '/v1/responses',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 12000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          const text = json.output_text || (Array.isArray(json.output) ? json.output.flatMap((item) => item.content || []).map((part) => part.text || '').join('\n') : '');
          resolve(text || null);
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

router.post('/context-assistant', async (req, res) => {
  const body = req.body || {};
  const payload = {
    message: cleanText(body.message || '', 1000),
    activeView: cleanText(body.activeView || '', 80),
    activeProduct: cleanText(body.activeProduct || '', 80),
    pageTitle: cleanText(body.pageTitle || '', 180),
    pageSummary: cleanText(body.pageSummary || '', 5000),
  };
  const aiAnswer = await callOpenAiForContextAssistant(payload).catch(() => null);
  return res.json({ ok: true, answer: aiAnswer || fallbackContextAssistant(payload), source: aiAnswer ? 'openai' : 'fallback' });
});

module.exports = router;
