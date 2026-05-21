const express = require('express');
const { Review, Settings, CampaignEvent } = require('../models');
const { cleanShopDomain, isValidShopDomain, cleanText, cleanEmail, clampNumber, getClientIp } = require('../utils/validation');
const { hashValue } = require('../utils/crypto');
const { shopifyFetchOptional } = require('../utils/shopify');
const { verifyReviewToken, productMatchesToken, normaliseProduct } = require('../utils/reviewTokens');
const { awardForReview } = require('../modules/loyalty/loyalty.service');

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



function isTestSubmission(body = {}, query = {}) {
  return Boolean(body.isTestReview || body.testMode || body.isPreview || query.preview === '1' || query.test === '1' || query.testMode === '1');
}

function resolveVerification({ token, shopDomain, email, orderId, itemId, isTest = false }) {
  if (!token || isTest) {
    return {
      verifiedPurchase: false,
      tokenValid: false,
      tokenPayload: null,
      verificationNote: isTest ? 'Test review; never verified or published' : '',
    };
  }
  const verified = verifyReviewToken(token, { shopDomain, email, orderId, itemId });
  if (!verified.ok) return { verifiedPurchase: false, tokenValid: false, tokenPayload: null, error: verified.error, verificationNote: '' };
  if (verified.payload.testMode) return { verifiedPurchase: false, tokenValid: true, tokenPayload: verified.payload, verificationNote: 'Signed test link; never verified or published' };
  return {
    verifiedPurchase: true,
    tokenValid: true,
    tokenPayload: verified.payload,
    verificationNote: 'Verified by signed review request link',
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


function duplicateReviewBase({ shopDomain, email, orderId, itemId }) {
  const match = {
    shopDomain,
    email: cleanEmail(email),
    isDeleted: false,
    isTestReview: { $ne: true },
    testMode: { $ne: true },
    status: { $ne: 'spam' },
  };
  if (itemId) match.itemId = { $in: itemIdCandidates(itemId) };
  const cleanedOrder = cleanText(orderId, 120);
  if (cleanedOrder) match.orderId = cleanedOrder;
  return match;
}

async function alreadyReviewedProductIds({ shopDomain, email, orderId, products = [] }) {
  const cleanedEmail = cleanEmail(email);
  if (!cleanedEmail || !Array.isArray(products) || !products.length) return [];
  const ids = products.map((product) => cleanText(product.productId || product.itemId || product.id, 160)).filter(Boolean);
  if (!ids.length) return [];
  const candidates = ids.flatMap(itemIdCandidates);
  const match = duplicateReviewBase({ shopDomain, email: cleanedEmail, orderId });
  match.itemId = { $in: candidates };
  const existing = await Review.find(match).select('itemId').lean();
  const reviewed = new Set();
  existing.forEach((row) => {
    const rowCandidates = itemIdCandidates(row.itemId);
    ids.forEach((id) => {
      const inputCandidates = itemIdCandidates(id);
      if (rowCandidates.some((candidate) => inputCandidates.includes(candidate))) reviewed.add(id);
    });
  });
  return Array.from(reviewed);
}

function uniqueCampaignKey({ shopDomain, campaign, eventType, token, email, orderId, itemId }) {
  const tokenKey = cleanText(token, 200) || `${cleanEmail(email)}:${cleanText(orderId, 120)}:${cleanText(itemId, 120)}`;
  if (!shopDomain || !campaign || !eventType || !tokenKey) return '';
  return hashValue(`${shopDomain}:${campaign}:${eventType}:${tokenKey}`);
}

async function recordCampaignEventOnce(payload, { once = false } = {}) {
  const uniqueKey = uniqueCampaignKey(payload);
  const doc = {
    ...payload,
    uniqueKey,
  };
  if (once && uniqueKey) {
    const existing = await CampaignEvent.findOne({ shopDomain: payload.shopDomain, eventType: payload.eventType, uniqueKey }).lean();
    if (existing) return { created: false, existing };
  }
  const created = await CampaignEvent.create(doc);
  return { created: true, event: created };
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
    reply: plain.replyVisibility === 'private' ? '' : plain.reply,
    replyVisibility: plain.replyVisibility || 'public',
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


router.get('/reviews/already-reviewed', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    const email = cleanEmail(req.query.email);
    const orderId = cleanText(req.query.orderId || req.query.order, 120);
    let products = [];
    try { products = JSON.parse(String(req.query.products || '[]')); } catch (_) { products = []; }
    const single = cleanText(req.query.itemId || req.query.productId, 160);
    if (single) products.push({ id: single, productId: single });
    const reviewedProductIds = await alreadyReviewedProductIds({ shopDomain, email, orderId, products });
    return res.json({ alreadyReviewed: reviewedProductIds.length > 0, reviewedProductIds });
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
    const email = cleanEmail(req.body.email);
    if (!email) return res.status(400).json({ error: 'A valid email is required to submit a review.' });

    const existingReview = await Review.findOne(duplicateReviewBase({ shopDomain, email, orderId: cleanText(req.body.orderId, 120), itemId })).lean();
    if (existingReview) {
      return res.status(409).json({ error: 'You have already reviewed this product.', alreadyReviewed: true, reviewedItemIds: [itemId] });
    }

    const reviewToken = cleanText(req.body.reviewToken || req.query.token, 3000);
    const isTest = isTestSubmission(req.body, req.query);
    const orderId = cleanText(req.body.orderId, 120);
    const verification = resolveVerification({ token: reviewToken, shopDomain, email, orderId, itemId, isTest });
    if (reviewToken && !isTest && !verification.tokenValid) {
      return res.status(400).json({ error: verification.error || 'Invalid review verification link.' });
    }
    const reviewTokenKey = verification.tokenValid ? hashValue(reviewToken) : '';
    if (verification.tokenValid) {
      const used = await Review.findOne({ shopDomain, reviewToken: reviewTokenKey, reviewTokenUsedAt: { $ne: null } }).lean();
      if (used) return res.status(409).json({ error: 'This review link has already been used.' });
    }

    const config = await getSettings(shopDomain);
    const verifiedPurchase = verification.verifiedPurchase;
    const payload = {
      shopDomain,
      itemId,
      rating,
      userId: cleanText(req.body.userId || req.body.name || 'Guest', 120) || 'Guest',
      email,
      isAnonymous: Boolean(req.body.isAnonymous),
      headline: cleanText(req.body.headline || req.body.title, 160),
      comment: cleanText(req.body.comment || req.body.body, 2500),
      attributes: req.body.attributes && typeof req.body.attributes === 'object' ? req.body.attributes : undefined,
      productTags: Array.isArray(req.body.productTags) ? req.body.productTags.map((tag) => cleanText(tag, 80)).filter(Boolean) : [],
      source: ['website', 'email', 'import'].includes(req.body.source) ? req.body.source : 'website',
      verifiedPurchase,
      verificationNote: verification.verificationNote,
      orderId,
      reviewToken: reviewTokenKey,
      reviewTokenUsedAt: verification.tokenValid ? new Date() : null,
      status: isTest ? 'spam' : shouldAutoApprove(config, { rating, verifiedPurchase }),
      isTestReview: isTest,
      testMode: Boolean(req.body.testMode || req.body.isPreview || req.query.testMode === '1'),
      testLabel: cleanText(req.body.testLabel, 80),
    };

    const saved = await Review.create(payload);
    await awardForReview({ shopDomain, review: saved, trigger: 'review_submitted' }).catch((error) => console.warn('Loyalty submit award skipped:', error.message));
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
    const existingReview = await Review.findOne(duplicateReviewBase({ shopDomain, email, orderId: cleanText(req.body.orderId, 120), itemId })).lean();
    if (existingReview) {
      return res.status(409).json({ error: 'You have already reviewed this product.', alreadyReviewed: true, reviewedItemIds: [itemId] });
    }

    const reviewToken = cleanText(req.body.reviewToken || req.query.token, 3000);
    const isTest = isTestSubmission(req.body, req.query);
    const submissionEmail = cleanEmail(req.body.email);
    if (!submissionEmail) return res.status(400).json({ error: 'A valid email is required to submit reviews.' });
    const orderId = cleanText(req.body.orderId || req.body.order, 120);
    let tokenPayload = null;
    let tokenValid = false;
    let reviewTokenKey = '';
    if (reviewToken && !isTest) {
      const verified = verifyReviewToken(reviewToken, { shopDomain, email: submissionEmail, orderId });
      if (!verified.ok) return res.status(400).json({ error: verified.error || 'Invalid review verification link.' });
      tokenValid = true;
      tokenPayload = verified.payload;
      reviewTokenKey = hashValue(reviewToken);
      const used = await Review.findOne({ shopDomain, reviewToken: reviewTokenKey, reviewTokenUsedAt: { $ne: null } }).lean();
      if (used) return res.status(409).json({ error: 'This review link has already been used.' });
    }
    const reviewedProductIds = await alreadyReviewedProductIds({
      shopDomain,
      email: submissionEmail,
      orderId,
      products: incoming.map((review) => ({ id: review.itemId || review.productId, productId: review.itemId || review.productId })),
    });
    const reviewedSet = new Set(reviewedProductIds.map(String));
    if (reviewedSet.size && incoming.every((review) => reviewedSet.has(String(review.itemId || review.productId)))) {
      return res.status(409).json({
        error: 'You have already reviewed these products.',
        alreadyReviewed: true,
        reviewedItemIds: Array.from(reviewedSet),
      });
    }

    const config = await getSettings(shopDomain);
    const docs = incoming.filter((review) => !reviewedSet.has(String(review.itemId || review.productId))).map((review) => {
      const itemId = cleanText(review.itemId || review.productId, 160);
      const rating = clampNumber(review.rating, 1, 5, 0);
      if (!itemId || !rating) return null;
      const productIsInSignedRequest = tokenValid && productMatchesToken(itemId, tokenPayload);
      const verifiedPurchase = Boolean(productIsInSignedRequest && !tokenPayload?.testMode && !isTest);
      return {
        shopDomain,
        itemId,
        rating,
        userId: cleanText(review.userId || review.name || req.body.customerName || 'Verified Customer', 120) || 'Verified Customer',
        email: cleanEmail(review.email || submissionEmail),
        isAnonymous: Boolean(review.isAnonymous),
        headline: cleanText(review.headline || review.title, 160),
        comment: cleanText(review.comment || review.body, 2500),
        attributes: review.attributes && typeof review.attributes === 'object' ? review.attributes : undefined,
        productTags: Array.isArray(review.productTags) ? review.productTags.map((tag) => cleanText(tag, 80)).filter(Boolean) : [],
        source: 'email',
        verifiedPurchase,
        verificationNote: verifiedPurchase ? 'Verified by signed review request link' : '',
        orderId: cleanText(req.body.orderId || review.orderId, 120),
        reviewToken: reviewTokenKey,
        reviewTokenUsedAt: tokenValid ? new Date() : null,
        status: Boolean(isTest || review.isTestReview || review.testMode) ? 'spam' : shouldAutoApprove(config, { rating, verifiedPurchase }),
        isTestReview: Boolean(isTest || review.isTestReview || review.testMode),
        testMode: Boolean(isTest || review.testMode),
        testLabel: Boolean(isTest || review.isTestReview || review.testMode) ? 'Review page test' : '',
      };
    }).filter(Boolean);
    if (!docs.length) return res.status(400).json({ error: 'No valid reviews supplied.' });
    const saved = await Review.insertMany(docs, { ordered: true });
    for (const review of saved) {
      await awardForReview({ shopDomain, review, trigger: 'review_submitted' }).catch((error) => console.warn('Loyalty bulk submit award skipped:', error.message));
    }
    return res.status(201).json({ ok: true, reviews: saved.map(normaliseReviewForPublic), count: saved.length, alreadyReviewedItemIds: reviewedProductIds });
  } catch (error) {
    next(error);
  }
});

router.get('/magic-link/order', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop);
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    const reviewToken = cleanText(req.query.token || req.query.reviewToken, 3000);
    let tokenPayload = null;
    let tokenVerified = false;
    if (reviewToken) {
      const verified = verifyReviewToken(reviewToken, { shopDomain, email: cleanEmail(req.query.email), orderId: cleanText(req.query.orderId || req.query.order, 120) });
      if (verified.ok) {
        tokenVerified = true;
        tokenPayload = verified.payload;
      } else if (req.query.preview !== '1' && req.query.test !== '1') {
        return res.status(400).json({ error: verified.error || 'Invalid review verification link.' });
      }
    }
    const queryProducts = productsFromQuery(req.query);
    const tokenProducts = tokenPayload?.products?.map(normaliseProduct).filter((product) => product.id) || [];
    const products = queryProducts.length ? queryProducts : tokenProducts;
    if (!products.length) return res.status(404).json({ error: 'No review products were included in this link.' });
    return res.json({
      orderId: cleanText(tokenPayload?.orderId || req.query.orderId || req.query.order || '1001', 120),
      customerName: cleanText(tokenPayload?.customerName || req.query.customer || req.query.name || 'Customer', 120),
      customerEmail: cleanEmail(tokenPayload?.email || req.query.email),
      products,
      alreadyReviewedProductIds: await alreadyReviewedProductIds({ shopDomain, email: cleanEmail(tokenPayload?.email || req.query.email), orderId: cleanText(tokenPayload?.orderId || req.query.orderId || req.query.order, 120), products }),
      delivered: true,
      verifiedLink: tokenVerified && !tokenPayload?.testMode,
      preview: tokenPayload?.testMode || req.query.preview === '1' || req.query.preview === 'true' || req.query.test === '1',
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
      await recordCampaignEventOnce({
        shopDomain,
        campaign: cleanText(req.query.campaign || 'review_request', 120),
        eventType: 'open',
        orderId: cleanText(req.query.orderId, 120),
        email: cleanEmail(req.query.email),
        itemId: cleanText(req.query.itemId, 120),
        token: cleanText(req.query.token, 200),
        userAgent: cleanText(req.headers['user-agent'], 500),
        ipHash: hashValue(getClientIp(req)),
      }, { once: true });
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
      await recordCampaignEventOnce({
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
      }, { once: true });
    }
    return res.redirect(302, redirectUrl);
  } catch (error) {
    next(error);
  }
});



router.get('/products/search', async (req, res, next) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop || req.headers['x-shop-domain'] || '');
    if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    const queryText = cleanText(req.query.q, 120).toLowerCase();
    if (!queryText) return res.json({ products: [] });
    const data = await shopifyFetchOptional(`/admin/api/${process.env.SHOPIFY_API_VERSION || '2026-07'}/products.json?limit=250&fields=id,title,handle,image,variants,tags`, { shopDomain });
    if (!data) return res.json({ products: [], unavailable: true, requiresOauth: true, message: 'Connect this shop through Shopify OAuth to enable product search.' });
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
  } catch (error) { next(error); }
});

module.exports = router;
