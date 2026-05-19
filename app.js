const express = require('express');
const { Review, Settings, CampaignEvent } = require('../models');
const { cleanShopDomain, isValidShopDomain, cleanText, cleanEmail, clampNumber, getClientIp } = require('../utils/validation');
const { hashValue } = require('../utils/crypto');

const router = express.Router();

function onePixelGif() {
  return Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
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

router.get('/reviews', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    const itemId = cleanText(req.query.itemId || req.query.productId, 120);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    if (!itemId) return res.status(400).json({ error: 'itemId is required.' });

    const limit = clampNumber(req.query.limit, 1, 50, 20);
    const match = { shopDomain, itemId, status: 'accepted', isDeleted: false };
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
      settings: {
        betaMode: config?.betaMode || { enabled: false, email: '' },
        seo: config?.seo || { richSnippets: true },
        widgetStyles: config?.widgetStyles || {},
        cardStyles: config?.cardStyles || {},
        carouselStyles: config?.carouselStyles || {},
        attributeProfiles: config?.attributeProfiles || [],
      },
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
      status: shouldAutoApprove(config, { rating, verifiedPurchase }),
      isTestReview: Boolean(req.body.isTestReview),
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
    const itemId = cleanText(req.query.itemId || req.query.productId, 120);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });

    const match = { shopDomain, status: 'accepted', isDeleted: false };
    if (itemId) match.itemId = itemId;
    const rows = await Review.find(match).select('rating').lean();
    const count = rows.length;
    const average = count ? Number((rows.reduce((sum, row) => sum + row.rating, 0) / count).toFixed(1)) : 0;
    return res.json({ count, average });
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
