const crypto = require('crypto');
const mongoose = require('mongoose');
const { Settings } = require('../models');
const { cleanShopDomain, isValidShopDomain, cleanText, cleanEmail } = require('./validation');
const { verifyReviewToken, normaliseId } = require('./reviewTokens');

let guardIndexPromise = null;

function submissionGuardCollection() {
  return mongoose.connection.collection('review_submission_guards');
}

function ensureGuardIndex() {
  if (!guardIndexPromise) {
    guardIndexPromise = submissionGuardCollection()
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' })
      .catch((error) => {
        guardIndexPromise = null;
        console.warn('[Review security] TTL guard index unavailable:', error.message);
      });
  }
  return guardIndexPromise;
}

function isTest(body = {}, query = {}) {
  return Boolean(body.isTestReview || body.testMode || body.isPreview || query.preview === '1' || query.test === '1' || query.testMode === '1');
}

function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((tag) => cleanText(tag, 80)).filter(Boolean);
}

function matchingProfileLabels(config = {}, body = {}) {
  const tags = new Set(cleanTags(body.productTags).map((tag) => tag.toLowerCase()));
  const itemId = normaliseId(body.itemId || body.productId || '');
  const profiles = Array.isArray(config.attributeProfiles) ? config.attributeProfiles : [];
  return new Set(profiles.filter((profile) => {
    const type = String(profile.type || profile.ruleType || '').toLowerCase().replace(/[^a-z]/g, '');
    const condition = cleanText(profile.condition || profile.value || '', 160).toLowerCase();
    if (type === 'all' || type === 'global') return true;
    if (!condition) return false;
    if (type === 'tag' || type === 'producttag') return tags.has(condition);
    if (type === 'product' || type === 'productid') return itemId && itemId === normaliseId(condition);
    return false;
  }).map((profile) => cleanText(profile.label, 80)).filter(Boolean));
}

function tokenSliderLabels(payload = {}, itemId = '') {
  const target = normaliseId(itemId);
  const product = (Array.isArray(payload.products) ? payload.products : []).find((row) => {
    return [row.productId, row.id, row.variantId].map(normaliseId).includes(target);
  });
  return new Set((Array.isArray(product?.matchingSliders) ? product.matchingSliders : [])
    .map((slider) => cleanText(slider.label, 80)).filter(Boolean));
}

function sanitizeAttributes(input, allowedLabels) {
  if (input == null) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Invalid review attributes.'), { status: 400, publicMessage: 'Review scores are invalid.' });
  const entries = Object.entries(input);
  if (entries.length > 20) throw Object.assign(new Error('Too many review attributes.'), { status: 400, publicMessage: 'Too many review scores were supplied.' });
  const output = {};
  for (const [rawKey, rawValue] of entries) {
    const key = cleanText(rawKey, 80);
    if (!key || key.includes('.') || key.startsWith('$') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw Object.assign(new Error('Unsafe review attribute key.'), { status: 400, publicMessage: 'Review scores are invalid.' });
    }
    if (allowedLabels.size && !allowedLabels.has(key)) {
      throw Object.assign(new Error(`Unexpected review attribute: ${key}`), { status: 400, publicMessage: 'One or more review scores are not valid for this product.' });
    }
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      throw Object.assign(new Error(`Review attribute out of range: ${key}`), { status: 400, publicMessage: 'Review scores must be between 0 and 100.' });
    }
    output[key] = Math.round(numeric * 100) / 100;
  }
  return output;
}

async function reviewSubmissionSecurity(req, res, next) {
  if (req.method !== 'POST') return next();
  try {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > 96 * 1024) return res.status(413).json({ error: 'Review submission is too large.' });

    const body = req.body || {};
    if (body.website || body.companyWebsite || body.faxNumber) return res.status(202).json({ ok: true });

    const shopDomain = cleanShopDomain(body.shopDomain || body.shop);
    const email = cleanEmail(body.email);
    const itemId = cleanText(body.itemId || body.productId, 160);
    const orderId = cleanText(body.orderId || body.order, 120);
    if (!shopDomain || !isValidShopDomain(shopDomain) || !email || !itemId) return next();

    body.productTags = cleanTags(body.productTags);
    const testMode = isTest(body, req.query || {});
    const token = cleanText(body.reviewToken || req.query.token, 3000);
    let allowedLabels = new Set();

    if (token && !testMode) {
      const verified = verifyReviewToken(token, { shopDomain, email, orderId, itemId });
      if (!verified.ok) return res.status(400).json({ error: verified.error || 'Invalid review verification link.' });
      allowedLabels = tokenSliderLabels(verified.payload, itemId);
    } else {
      const config = await Settings.findOne({ shopDomain }).select('attributeProfiles').lean();
      allowedLabels = matchingProfileLabels(config || {}, body);
    }

    if (body.attributes !== undefined) body.attributes = sanitizeAttributes(body.attributes, allowedLabels);

    if (!testMode) {
      await ensureGuardIndex();
      const lockId = crypto.createHash('sha256').update(`${shopDomain}|${email}|${orderId}|${normaliseId(itemId)}`).digest('hex');
      const lock = { _id: lockId, shopDomain, createdAt: new Date(), expiresAt: new Date(Date.now() + 15 * 60 * 1000) };
      try {
        await submissionGuardCollection().insertOne(lock);
      } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: 'This review is already being submitted or has just been submitted.', alreadyReviewed: true });
        throw error;
      }
      res.on('finish', () => {
        if (res.statusCode >= 400) submissionGuardCollection().deleteOne({ _id: lockId }).catch(() => {});
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = reviewSubmissionSecurity;
