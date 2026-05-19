const express = require('express');
const { Review, Settings, CampaignEvent } = require('../models');
const { cleanShopDomain, isValidShopDomain, cleanText, cleanEmail, clampNumber, getClientIp } = require('../utils/validation');
const { hashValue } = require('../utils/crypto');

const router = express.Router();

function onePixelGif() {
  return Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
}

function itemIdCandidates(value) {
  const raw = cleanText(value, 200);
  const set = new Set();
  if (raw) set.add(raw);
  if (raw) set.add(raw.replace(/^gid:\/\/shopify\/(Product|Variant)\//, ''));
  const parts = raw.split('/').filter(Boolean);
  if (parts.length) set.add(parts[parts.length - 1]);
  const digits = raw.match(/\d{5,}/g) || [];
  digits.forEach((item) => {
    set.add(item);
    set.add(`gid://shopify/Product/${item}`);
    set.add(`gid://shopify/Variant/${item}`);
  });
  return Array.from(set).filter(Boolean);
}

async function getSettings(shopDomain) {
  return Settings.findOne({ shopDomain }).lean();
}

function shouldAutoApprove(config, payload) {
  if (!config?.autoApproveEnabled) return 'pending';
  if (payload.rating < Number(config.autoApproveMinStars || 4)) return 'pending';
  if (config.autoApproveType === 'verified' && !payload.verifiedPurchase) return 'pending';
  return 'accepted';
}


function publicSettings(config) {
  const widgetStyles = config?.widgetStyles || {};
  return {
    betaMode: config?.betaMode || { enabled: false, email: '' },
    seo: config?.seo || { richSnippets: true },
    widgetStyles,
    styles: widgetStyles,
    cardStyles: config?.cardStyles || {},
    carouselStyles: config?.carouselStyles || {},
    attributeProfiles: config?.attributeProfiles || [],
    profiles: config?.attributeProfiles || [],
    requireDeliveredTag: config?.requireDeliveredTag !== false,
  };
}


function liveReviewMatch(extra = {}) {
  return {
    ...extra,
    status: 'accepted',
    isDeleted: false,
    isTestReview: { $ne: true },
    testMode: { $ne: true },
  };
}

function normaliseReviewForPublic(review) {
  const plain = review && typeof review.toObject === 'function' ? review.toObject() : review;
  if (!plain) return plain;
  return {
    _id: plain._id,
    itemId: plain.itemId,
    userId: plain.userId,
    isAnonymous: Boolean(plain.isAnonymous),
    rating: plain.rating,
    headline: plain.headline,
    comment: plain.comment,
    reply: plain.reply,
    attributes: plain.attributes,
    productTags: plain.productTags || [],
    source: plain.source,
    verifiedPurchase: Boolean(plain.verifiedPurchase),
    createdAt: plain.createdAt,
    testMode: Boolean(plain.testMode),
    isTestReview: Boolean(plain.isTestReview),
  };
}

function buildProductFromQuery(query) {
  const productId = cleanText(query.productId || query.product_id || query.itemId, 160);
  if (!productId) return null;
  return {
    productId,
    id: productId,
    variantId: cleanText(query.variantId || query.variant_id, 160),
    name: cleanText(query.productTitle || query.product_title || query.title || 'Product', 240) || 'Product',
    title: cleanText(query.productTitle || query.product_title || query.title || 'Product', 240) || 'Product',
    image: cleanText(query.image || query.productImage || query.product_image, 1000),
    quantity: clampNumber(query.quantity, 1, 999, 1),
    tags: [],
  };
}

function productsFromQuery(query) {
  const products = [];
  const rawProducts = String(query.products || '').trim();
  if (rawProducts) {
    try {
      const parsed = JSON.parse(rawProducts);
      if (Array.isArray(parsed)) {
        parsed.forEach((product, index) => {
          const id = cleanText(product.productId || product.itemId || product.id || `product-${index + 1}`, 160);
          if (!id) return;
          products.push({
            productId: id,
            id,
            variantId: cleanText(product.variantId || product.variant_id || product.variant || '', 160),
            name: cleanText(product.name || product.title || `Product ${index + 1}`, 240) || `Product ${index + 1}`,
            title: cleanText(product.name || product.title || `Product ${index + 1}`, 240) || `Product ${index + 1}`,
            image: cleanText(product.image || product.imageUrl || product.productImage || '', 1000),
            quantity: clampNumber(product.quantity, 1, 999, 1),
            tags: Array.isArray(product.tags) ? product.tags.map((tag) => cleanText(tag, 80)).filter(Boolean) : [],
          });
        });
      }
    } catch (error) {
      // Keep falling back to individual product query params.
    }
  }
  const single = buildProductFromQuery(query);
  if (single && !products.some((product) => String(product.productId) === String(single.productId))) products.push(single);
  return products;
}

router.get('/widget/config', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    const config = await getSettings(shopDomain);
    return res.json(publicSettings(config));
  } catch (error) {
    next(error);
  }
});

router.get('/global-reviews', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    const limit = clampNumber(req.query.limit, 1, 50, 20);
    const reviews = await Review.find(liveReviewMatch({ shopDomain }))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json(reviews.map(normaliseReviewForPublic));
  } catch (error) {
    next(error);
  }
});

router.get('/reviews', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    const itemId = cleanText(req.query.itemId || req.query.productId, 160);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    if (!itemId) return res.status(400).json({ error: 'itemId is required.' });

    const limit = clampNumber(req.query.limit, 1, 50, 20);
    const candidates = itemIdCandidates(itemId);
    const match = liveReviewMatch({ shopDomain, itemId: { $in: candidates } });
    const allReviews = await Review.find(match)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    const reviews = allReviews.slice(0, limit);

    const count = allReviews.length;
    const average = count
      ? Number((allReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count).toFixed(1))
      : 0;

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const attrTotals = {};
    allReviews.forEach((review) => {
      const star = Math.max(1, Math.min(5, Math.round(Number(review.rating || 0))));
      distribution[star] = (distribution[star] || 0) + 1;
      const attrs = review.attributes && typeof review.attributes === 'object' ? review.attributes : {};
      Object.entries(attrs).forEach(([key, value]) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return;
        if (!attrTotals[key]) attrTotals[key] = { sum: 0, count: 0 };
        attrTotals[key].sum += numeric;
        attrTotals[key].count += 1;
      });
    });
    const attributeAverages = Object.fromEntries(Object.entries(attrTotals).map(([key, item]) => [
      key,
      item.count ? Number((item.sum / item.count).toFixed(1)) : 0,
    ]));

    const config = await getSettings(shopDomain);
    return res.json({
      reviews,
      count,
      average,
      distribution,
      attributeAverages,
      settings: publicSettings(config),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reviews', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.body.shopDomain || req.body.shop);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });

    const itemId = cleanText(req.body.itemId || req.body.productId, 120);
    const rating = clampNumber(req.body.rating, 1, 5, 0);
    if (!itemId) return res.status(400).json({ error: 'itemId is required.' });
    if (!rating) return res.status(400).json({ error: 'rating must be between 1 and 5.' });

    const reviewToken = cleanText(req.body.reviewToken || req.query.token, 200);
    if (reviewToken) {
      const used = await Review.findOne({ shopDomain, reviewToken, reviewTokenUsedAt: { $ne: null } }).lean();
      if (used) return res.status(409).json({ error: 'This review link has already been used.' });
    }

    const config = await getSettings(shopDomain);
    const verifiedPurchase = Boolean(req.body.verifiedPurchase);
    const payload = {
      shopDomain,
      itemId,
      rating,
      userId: cleanText(req.body.userId || req.body.name || 'Guest', 120) || 'Guest',
      email: cleanEmail(req.body.email),
      isAnonymous: Boolean(req.body.isAnonymous),
      headline: cleanText(req.body.headline || req.body.title, 160),
      comment: cleanText(req.body.comment || req.body.body, 2500),
      attributes: req.body.attributes && typeof req.body.attributes === 'object' ? req.body.attributes : undefined,
      productTags: Array.isArray(req.body.productTags) ? req.body.productTags.map((tag) => cleanText(tag, 80)).filter(Boolean) : [],
      source: ['website', 'email', 'import'].includes(req.body.source) ? req.body.source : 'website',
      verifiedPurchase,
      verificationNote: verifiedPurchase ? 'Marked as verified by review source' : '',
      orderId: cleanText(req.body.orderId, 120),
      reviewToken,
      reviewTokenUsedAt: reviewToken ? new Date() : null,
      status: (Boolean(req.body.isTestReview) || Boolean(req.body.testMode)) ? 'spam' : shouldAutoApprove(config, { rating, verifiedPurchase }),
      isTestReview: Boolean(req.body.isTestReview) || Boolean(req.body.testMode),
      testMode: Boolean(req.body.testMode),
      testLabel: cleanText(req.body.testLabel, 80),
    };

    const saved = await Review.create(payload);
    return res.status(201).json({ ok: true, review: saved });
  } catch (error) {
    next(error);
  }
});

router.get('/reviews/summary', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    const itemId = cleanText(req.query.itemId || req.query.productId, 160);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });

    const match = liveReviewMatch({ shopDomain });
    if (itemId) match.itemId = { $in: itemIdCandidates(itemId) };
    const rows = await Review.find(match).select('rating').lean();
    const count = rows.length;
    const average = count ? Number((rows.reduce((sum, row) => sum + row.rating, 0) / count).toFixed(1)) : 0;
    return res.json({ count, average });
  } catch (error) {
    next(error);
  }
});


router.get('/reviews/:itemId', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    const itemId = cleanText(req.params.itemId || req.query.itemId || req.query.productId, 160);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    if (!itemId) return res.status(400).json({ error: 'itemId is required.' });
    const limit = clampNumber(req.query.limit, 1, 50, 20);
    const reviews = await Review.find(liveReviewMatch({ shopDomain, itemId: { $in: itemIdCandidates(itemId) } }))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json(reviews.map(normaliseReviewForPublic));
  } catch (error) {
    next(error);
  }
});

router.post('/reviews/bulk', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.body.shopDomain || req.body.shop);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    const incoming = Array.isArray(req.body.reviews) ? req.body.reviews : [];
    if (!incoming.length) return res.status(400).json({ error: 'No reviews supplied.' });
    if (incoming.length > 50) return res.status(400).json({ error: 'Bulk review limit is 50 at a time.' });
    const reviewToken = cleanText(req.body.reviewToken || req.query.token, 200);
    if (reviewToken) {
      const used = await Review.findOne({ shopDomain, reviewToken, reviewTokenUsedAt: { $ne: null } }).lean();
      if (used) return res.status(409).json({ error: 'This review link has already been used.' });
    }
    const config = await getSettings(shopDomain);
    const docs = incoming.map((review) => {
      const itemId = cleanText(review.itemId || review.productId, 160);
      const rating = clampNumber(review.rating, 1, 5, 0);
      if (!itemId || !rating) return null;
      const verifiedPurchase = review.verifiedPurchase !== false;
      return {
        shopDomain,
        itemId,
        rating,
        userId: cleanText(review.userId || review.name || req.body.customerName || 'Verified Customer', 120) || 'Verified Customer',
        email: cleanEmail(review.email || req.body.email),
        isAnonymous: Boolean(review.isAnonymous),
        headline: cleanText(review.headline || review.title, 160),
        comment: cleanText(review.comment || review.body, 2500),
        attributes: review.attributes && typeof review.attributes === 'object' ? review.attributes : undefined,
        productTags: Array.isArray(review.productTags) ? review.productTags.map((tag) => cleanText(tag, 80)).filter(Boolean) : [],
        source: 'email',
        verifiedPurchase,
        verificationNote: verifiedPurchase ? 'Submitted through review request page' : '',
        orderId: cleanText(req.body.orderId || review.orderId, 120),
        reviewToken,
        reviewTokenUsedAt: reviewToken ? new Date() : null,
        status: Boolean(req.body.isPreview || req.body.testMode || review.isTestReview || review.testMode) ? 'spam' : shouldAutoApprove(config, { rating, verifiedPurchase }),
        isTestReview: Boolean(req.body.isPreview || req.body.testMode || review.isTestReview || review.testMode),
        testMode: Boolean(req.body.isPreview || req.body.testMode || review.testMode),
        testLabel: Boolean(req.body.isPreview || req.body.testMode || review.testMode) ? 'Review page test' : '',
      };
    }).filter(Boolean);
    if (!docs.length) return res.status(400).json({ error: 'No valid reviews supplied.' });
    const saved = await Review.insertMany(docs, { ordered: true });
    return res.status(201).json({ ok: true, reviews: saved.map(normaliseReviewForPublic), count: saved.length });
  } catch (error) {
    next(error);
  }
});

router.get('/magic-link/order', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    const products = productsFromQuery(req.query);
    if (!products.length) return res.status(404).json({ error: 'No review products were included in this link.' });
    return res.json({
      orderId: cleanText(req.query.orderId || req.query.order || '1001', 120),
      customerName: cleanText(req.query.customer || req.query.name || 'Customer', 120),
      customerEmail: cleanEmail(req.query.email),
      products,
      delivered: true,
      preview: req.query.preview === '1' || req.query.preview === 'true' || req.query.test === '1',
      support: {},
    });
  } catch (error) {
    next(error);
  }
});

router.post('/support-requests', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.body.shopDomain || req.body.shop);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    await CampaignEvent.create({
      shopDomain,
      campaign: 'support_request',
      eventType: 'click',
      orderId: cleanText(req.body.orderId, 120),
      email: cleanEmail(req.body.email),
      url: 'support-request',
      userAgent: cleanText(req.headers['user-agent'], 500),
      ipHash: hashValue(getClientIp(req)),
    });
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/campaign/open', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    if (shopDomain && isValidShopDomain(shopDomain)) {
      await CampaignEvent.create({
        shopDomain,
        campaign: cleanText(req.query.campaign || 'review_request', 120),
        eventType: 'open',
        orderId: cleanText(req.query.orderId, 120),
        email: cleanEmail(req.query.email),
        itemId: cleanText(req.query.itemId, 120),
        token: cleanText(req.query.token, 200),
        userAgent: cleanText(req.headers['user-agent'], 500),
        ipHash: hashValue(getClientIp(req)),
      });
    }
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.end(onePixelGif());
  } catch (error) {
    next(error);
  }
});

router.get('/campaign/click', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    const rawUrl = String(req.query.url || '');
    const fallbackUrl = shopDomain ? `https://${shopDomain}` : '/';
    let redirectUrl = fallbackUrl;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') redirectUrl = parsed.toString();
    } catch (_) {}

    if (shopDomain && isValidShopDomain(shopDomain)) {
      await CampaignEvent.create({
        shopDomain,
        campaign: cleanText(req.query.campaign || 'review_request', 120),
        eventType: 'click',
        orderId: cleanText(req.query.orderId, 120),
        email: cleanEmail(req.query.email),
        itemId: cleanText(req.query.itemId, 120),
        url: redirectUrl,
        token: cleanText(req.query.token, 200),
        userAgent: cleanText(req.headers['user-agent'], 500),
        ipHash: hashValue(getClientIp(req)),
      });
    }
    return res.redirect(302, redirectUrl);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
