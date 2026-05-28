const express = require('express');
const { Review, Settings, SupportRequest, ReviewToken } = require('../models');
const { cleanText, cleanEmail, clampNumber, cleanShopDomain } = require('../utils/validation');
const { sha256 } = require('../utils/crypto');
const { verifyPayload, hashToken } = require('../utils/reviewTokens');
const router = express.Router();

function shop(req) { return cleanShopDomain(req.query.shopDomain || req.query.shop || req.body?.shopDomain || req.headers['x-shop-domain'] || ''); }
function acceptedQuery(shopDomain, extra = {}) { return { shopDomain, status: 'accepted', isDeleted: { $ne: true }, ...extra }; }
function aggregate(reviews) {
  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / count : 0;
  return { count, average: Math.round(avg * 10) / 10 };
}

router.get('/widget/config', async (req, res, next) => {
  try {
    const shopDomain = shop(req);
    const settings = await Settings.findOneAndUpdate({ shopDomain }, { $setOnInsert: { shopDomain } }, { upsert: true, new: true }).lean();
    res.json({ ok: true, shopDomain, widgetEnabled: settings.widgetEnabled !== false, schemaEnabled: Boolean(settings.schemaEnabled), brandName: settings.brandName || 'Nectar Reviews' });
  } catch (error) { next(error); }
});

router.get('/reviews/:itemId', async (req, res, next) => {
  try {
    const shopDomain = shop(req);
    const itemId = cleanText(req.params.itemId, 240);
    const reviews = await Review.find(acceptedQuery(shopDomain, { itemId, reviewScope: { $ne: 'site' } })).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ ok: true, shopDomain, itemId, reviews, summary: aggregate(reviews) });
  } catch (error) { next(error); }
});

router.get('/global-reviews', async (req, res, next) => {
  try {
    const shopDomain = shop(req);
    const reviews = await Review.find(acceptedQuery(shopDomain)).sort({ createdAt: -1 }).limit(Number(req.query.limit || 100)).lean();
    res.json({ ok: true, shopDomain, reviews, summary: aggregate(reviews) });
  } catch (error) { next(error); }
});

router.get('/site-reviews', async (req, res, next) => {
  try {
    const shopDomain = shop(req);
    const reviews = await Review.find(acceptedQuery(shopDomain, { reviewScope: 'site' })).sort({ createdAt: -1 }).limit(Number(req.query.limit || 50)).lean();
    res.json({ ok: true, shopDomain, reviews, summary: aggregate(reviews) });
  } catch (error) { next(error); }
});

router.post('/reviews', async (req, res, next) => {
  try {
    const shopDomain = shop(req);
    const body = req.body || {};
    const itemId = cleanText(body.itemId || body.productId || '', 240);
    let verifiedPurchase = false;
    let verificationNote = '';
    if (body.token) {
      const token = cleanText(body.token, 2000);
      const payload = verifyPayload(token);
      const tokenHash = hashToken(token);
      const stored = await ReviewToken.findOne({ shopDomain, tokenHash, usedAt: null, expiresAt: { $gt: new Date() } });
      if (!stored) throw Object.assign(new Error('Review link has already been used or expired.'), { status: 409 });
      if (payload.shopDomain !== shopDomain || (itemId && Array.isArray(payload.itemIds) && !payload.itemIds.includes(itemId))) throw Object.assign(new Error('Review link does not match this review.'), { status: 400 });
      stored.usedAt = new Date();
      await stored.save();
      verifiedPurchase = true;
      verificationNote = 'Verified by signed one-use review link';
    }
    const email = cleanEmail(body.email);
    const duplicateHash = sha256([shopDomain, itemId, email, cleanText(body.orderId, 120)].join('|'));
    if (email) {
      const existing = await Review.findOne({ shopDomain, itemId, duplicateHash, isDeleted: { $ne: true } }).lean();
      if (existing) return res.status(409).json({ error: 'This product has already been reviewed from this link/customer.' });
    }
    const created = await Review.create({
      shopDomain,
      itemId,
      reviewScope: 'product',
      userId: cleanText(body.name || body.userId || 'Customer', 120),
      email,
      orderId: cleanText(body.orderId, 120),
      rating: clampNumber(body.rating, 1, 5, 5),
      headline: cleanText(body.headline || body.title, 180),
      comment: cleanText(body.comment || body.body, 5000),
      source: body.token ? 'email' : 'website',
      verifiedPurchase,
      verificationNote,
      status: body.preview || body.test ? 'test' : 'pending',
      duplicateHash,
    });
    res.status(201).json({ ok: true, review: created });
  } catch (error) { next(error); }
});

router.post('/reviews/bulk', async (req, res, next) => {
  try {
    const shopDomain = shop(req);
    const rows = Array.isArray(req.body?.reviews) ? req.body.reviews : [];
    const docs = rows.slice(0, 1000).map((row) => ({
      shopDomain,
      itemId: cleanText(row.itemId || row.productId || '__site__', 240),
      reviewScope: row.reviewScope === 'site' ? 'site' : 'product',
      userId: cleanText(row.userId || row.name || 'Imported customer', 120),
      email: cleanEmail(row.email),
      rating: clampNumber(row.rating, 1, 5, 5),
      headline: cleanText(row.headline || row.title, 180),
      comment: cleanText(row.comment || row.body, 5000),
      status: cleanText(row.status || 'accepted', 20),
      source: 'import',
      sourcePlatform: cleanText(row.sourcePlatform || 'manual', 80),
      sourceLabel: cleanText(row.sourceLabel || 'Bulk import', 120),
      verifiedPurchase: Boolean(row.verifiedPurchase),
      externalReviewId: cleanText(row.externalReviewId || '', 180),
      duplicateHash: sha256(JSON.stringify(row)),
      importedAt: new Date(),
    }));
    const inserted = docs.length ? await Review.insertMany(docs, { ordered: false }) : [];
    res.json({ ok: true, inserted: inserted.length });
  } catch (error) { next(error); }
});

router.get('/magic-link/order', async (req, res) => {
  res.json({ ok: true, orderId: cleanText(req.query.orderId || '', 120), items: [] });
});

router.post('/support-requests', async (req, res, next) => {
  try {
    const created = await SupportRequest.create({ shopDomain: shop(req), email: cleanEmail(req.body?.email), orderId: cleanText(req.body?.orderId, 120), orderDate: cleanText(req.body?.orderDate, 80), message: cleanText(req.body?.message, 2000) });
    res.status(201).json({ ok: true, request: created });
  } catch (error) { next(error); }
});

router.get('/campaign/open.gif', async (req, res) => {
  res.set('Content-Type', 'image/gif');
  res.send(Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'));
});

module.exports = router;
