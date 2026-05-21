const express = require('express');
const { env } = require('../config/env');
const nodemailer = require('nodemailer');
const { Review, Settings, CampaignEvent, EmailProviderSettings, Shop } = require('../models');
const { requireAdminSession } = require('../utils/security');
const { cleanText, cleanEmail, clampNumber, cleanReviewStatus } = require('../utils/validation');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const { publicEmailSettings } = require('../utils/emailSettings');
const { shopifyFetch, shopifyFetchOptional, getAccessTokenForShop, buildInstallUrl } = require('../utils/shopify');

const router = express.Router();

router.use(requireAdminSession);

function shopDomainFromReq(req) {
  return req.shopDomain;
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

async function buildCampaignAnalytics(shopDomain) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await CampaignEvent.find({ shopDomain, createdAt: { $gte: since } }).lean();
  const totals = { sent: 0, open: 0, click: 0 };
  events.forEach((event) => {
    if (totals[event.eventType] !== undefined) totals[event.eventType] += 1;
  });

  const byCampaign = {};
  events.forEach((event) => {
    const key = event.campaign || 'review_request';
    if (!byCampaign[key]) byCampaign[key] = { sent: 0, open: 0, click: 0, openRate: 0, clickRate: 0 };
    if (byCampaign[key][event.eventType] !== undefined) byCampaign[key][event.eventType] += 1;
  });
  Object.values(byCampaign).forEach((item) => {
    item.openRate = item.sent ? Number(((item.open / item.sent) * 100).toFixed(1)) : 0;
    item.clickRate = item.sent ? Number(((item.click / item.sent) * 100).toFixed(1)) : 0;
  });

  const sent = totals.sent || 0;
  return {
    windowDays: 30,
    totals,
    byCampaign,
    openRate: sent ? Number(((totals.open / sent) * 100).toFixed(1)) : 0,
    clickRate: sent ? Number(((totals.click / sent) * 100).toFixed(1)) : 0,
    recentEvents: events
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20),
  };
}

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
    if (Object.prototype.hasOwnProperty.call(req.body, 'verifiedPurchase')) allowed.verifiedPurchase = Boolean(req.body.verifiedPurchase);
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

    const docs = reviews.map((review) => {
      const rating = clampNumber(review.rating, 1, 5, 5);
      return {
        shopDomain,
        itemId: cleanText(review.itemId, 120),
        rating,
        userId: cleanText(review.userId || review.name || 'Imported Customer', 120) || 'Imported Customer',
        email: cleanEmail(review.email),
        headline: cleanText(review.headline || review.title, 160),
        comment: cleanText(review.comment || review.body, 2500),
        source: 'import',
        status: 'accepted',
        verifiedPurchase: Boolean(review.verifiedPurchase),
        createdAt: review.createdAt ? new Date(review.createdAt) : new Date(),
      };
    }).filter((review) => review.itemId && review.rating);

    const inserted = await Review.insertMany(docs, { ordered: false });
    return res.status(201).json({ ok: true, imported: inserted.length });
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
        emptyMode: cleanText(body.widgetStyles?.emptyMode || 'stars_text', 40),
        emptyText: cleanText(body.widgetStyles?.emptyText || 'No reviews yet.', 160),
        maxWidth: clampNumber(body.widgetStyles?.maxWidth, 720, 1800, 1160),
        reviewStarSize: clampNumber(body.widgetStyles?.reviewStarSize, 24, 72, 52),
        reviewStarAlignment: ['left', 'center', 'right'].includes(body.widgetStyles?.reviewStarAlignment) ? body.widgetStyles.reviewStarAlignment : 'center',
        sliderTrackColor: cleanText(body.widgetStyles?.sliderTrackColor || '#e6ebf1', 20),
        sliderKnobColor: cleanText(body.widgetStyles?.sliderKnobColor || '#111111', 20),
      },
      cardStyles: {
        starSize: clampNumber(body.cardStyles?.starSize, 10, 40, 14),
        showCount: body.cardStyles?.showCount !== false,
        badgeBackground: cleanText(body.cardStyles?.badgeBackground || '#111827', 20),
        badgeTextColor: cleanText(body.cardStyles?.badgeTextColor || '#ffffff', 20),
        badgeStarColor: cleanText(body.cardStyles?.badgeStarColor || body.cardStyles?.starColor || '#ffc700', 20),
        badgeRadius: clampNumber(body.cardStyles?.badgeRadius, 0, 999, 999),
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
    const reviews = await Review.find({ shopDomain, isDeleted: false, isTestReview: { $ne: true } }).lean();
    const config = await Settings.findOne({ shopDomain }).lean();
    const sources = { website: 0, email: 0, import: 0 };
    const products = {};

    reviews.forEach((review) => {
      if (sources[review.source] !== undefined) sources[review.source] += 1;
      if (!products[review.itemId]) products[review.itemId] = { count: 0, sum: 0 };
      products[review.itemId].count += 1;
      products[review.itemId].sum += Number(review.rating || 0);
    });

    let topProduct = { id: 'N/A', count: 0, averageRating: '0.0', title: null, image: null };
    const sorted = Object.entries(products).sort((a, b) => b[1].count - a[1].count);
    if (sorted.length) {
      const [id, item] = sorted[0];
      topProduct = { id, count: item.count, averageRating: (item.sum / item.count).toFixed(1), title: null, image: null };
      try {
        const productData = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/products/${id}.json?fields=id,title,image`, { shopDomain });
        if (productData?.product) {
          topProduct.title = productData.product.title;
          topProduct.image = productData.product.image?.src || null;
        }
      } catch (error) {
        console.warn('Could not fetch top product details:', error.message);
      }
    }

    const sent = config?.emailsSentTotal || 0;
    return res.json({
      sources,
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

    const fromName = settings.fromName || 'Nectar Reviews';
    const fromEmail = settings.fromEmail || settings.smtpUser;
    const orderId = cleanText(req.body.orderId || 'test-1001', 120);
    const itemId = cleanText(req.body.itemId || '', 120);
    const token = cleanText(req.body.token || `test-${Date.now()}`, 200);
    const trackingPixel = `${env.appUrl || ''}/api/campaign/open?shopDomain=${encodeURIComponent(shopDomain)}&campaign=test_review_request&orderId=${encodeURIComponent(orderId)}&email=${encodeURIComponent(to)}&itemId=${encodeURIComponent(itemId)}&token=${encodeURIComponent(token)}&t=${Date.now()}`;
    let html = String(req.body.html || '').slice(0, 200000);
    if (!html.includes('/api/campaign/open')) {
      html += `<img src="${trackingPixel}" width="1" height="1" alt="" style="display:none;opacity:0;width:1px;height:1px;">`;
    }

    await transporter.sendMail({
      from: `${fromName.replace(/"/g, '')} <${fromEmail}>`,
      to,
      replyTo: settings.replyToEmail || fromEmail,
      subject: cleanText(req.body.subject || 'Review request test email', 160),
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
