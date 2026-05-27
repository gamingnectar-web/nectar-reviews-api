const express = require('express');
const { env } = require('../config/env');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { Review, Settings, CampaignEvent, EmailProviderSettings, EmailProviderProfile, Shop, E2ETestRun } = require('../models');
const { requireAdminSession } = require('../utils/security');
const { cleanText, cleanEmail, clampNumber, cleanReviewStatus } = require('../utils/validation');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const { publicEmailSettings } = require('../utils/emailSettings');
const { shopifyFetch, shopifyFetchOptional, getAccessTokenForShop, buildInstallUrl } = require('../utils/shopify');
const { createReviewToken } = require('../utils/reviewTokens');
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
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
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

function providerUpdateFromBody(body = {}, existing = null) {
  if (!body.provider || body.provider === 'none') throw new Error('Choose a provider.');
  if (!body.smtpHost || !body.smtpUser || !body.fromEmail) throw new Error('SMTP host, username, and from email are required.');
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

async function buildCampaignAnalytics(shopDomain) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [events, reviews] = await Promise.all([
    CampaignEvent.find({ shopDomain, createdAt: { $gte: since } }).lean(),
    Review.find({ shopDomain, createdAt: { $gte: since } }).lean(),
  ]);

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
    const sent = Math.max(rawSent, rawOpen ? 1 : 0, rawClick ? 1 : 0, group.reviewed.size ? 1 : 0);
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
        status: 'accepted',
        verifiedPurchase: review.verifiedPurchase !== false,
        verificationNote: review.verifiedPurchase === false ? '' : 'Imported by merchant from previous verified review platform',
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
    const analytics = await buildCampaignAnalytics(shopDomainFromReq(req));
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
    const products = itemId ? [{ id: itemId, productId: itemId, title: productTitle }] : [];
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
      userAgent: cleanText(req.headers['user-agent'], 500),
    });
    await Settings.findOneAndUpdate({ shopDomain }, { $inc: { emailsSentTotal: 1 }, $setOnInsert: { shopDomain } }, { upsert: true });

    settings.lastTestedAt = new Date();
    settings.lastTestStatus = 'success';
    settings.lastTestError = '';
    await settings.save();
    return res.json({ ok: true, message: 'Test email sent.' });
  } catch (error) {
    await EmailProviderSettings.findOneAndUpdate({ shopDomain }, { $set: { lastTestedAt: new Date(), lastTestStatus: 'failed', lastTestError: error.message || 'Failed to send test email' } }).catch(() => {});
    next(error);
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
  const tokenSecretReady = Boolean(env.emailCredentialSecret || env.shopifyApiSecret);
  const activeEmailReady = Boolean(emailSettings?.enabled && emailSettings?.smtpPassEncrypted && emailSettings?.fromEmail);
  const primaryReviewsProvider = providers.find((provider) => Array.isArray(provider.primaryFor) && provider.primaryFor.includes('reviews'));
  const primaryLoyaltyProvider = providers.find((provider) => Array.isArray(provider.primaryFor) && provider.primaryFor.includes('loyalty'));
  const hasOauth = Boolean(shop?.accessTokenEncrypted);

  if (cfg.needsReviews) {
    prerequisites.push(e2eCheck('review_token_secret', 'Signed review links', tokenSecretReady ? 'ready' : 'blocked', tokenSecretReady ? 'Review links can be signed and verified.' : 'No signing secret is available. Set EMAIL_CREDENTIAL_SECRET or SHOPIFY_API_SECRET before review-link tests can work.', 'Set EMAIL_CREDENTIAL_SECRET / SHOPIFY_API_SECRET.'));
    prerequisites.push(e2eCheck(
      'shopify_flow',
      'Shopify Flow handoff',
      flowConfirmed ? 'ready' : 'blocked',
      flowConfirmed
        ? 'Flow has been marked as installed. Real fulfilled orders should be able to trigger review request emails.'
        : 'Flow has not been marked as installed. Email can work by itself, but real fulfilled orders will not automatically trigger review requests until a Shopify Flow workflow is created and switched on.',
      'Use the Flow setup guide in this Test Centre: create a Shopify Flow workflow, choose an order/fulfilment trigger, add a wait step, add Send internal email or HTTP request, paste the Nectar HTML/payload, switch the workflow on, then run this test again.'
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

module.exports = router;
