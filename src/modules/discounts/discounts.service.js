const DiscountSettings = require('./discount-settings.model');
const ReviewReward = require('./review-reward.model');
const { cleanShopDomain } = require('../../core/http/request-utils');
const { createToken } = require('../../core/security/credentials.service');
const { shopifyFetch, shopifyGraphql } = require('../../core/shopify/shopify.service');
const { isModuleEnabled } = require('../../core/modules/feature-access');
const { eventBus } = require('../../core/modules/event-bus');
const { publicCustomerRef, createScopedHash } = require('../../core/security/customer-identity.service');
const { recordAuditEvent } = require('../../core/audit/audit.service');

async function getSettings(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  return DiscountSettings.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $setOnInsert: { shopDomain: cleanShop } },
    { new: true, upsert: true }
  );
}

async function updateSettings(shopDomain, patch) {
  const cleanShop = cleanShopDomain(shopDomain);
  return DiscountSettings.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $set: { ...patch, shopDomain: cleanShop } },
    { new: true, upsert: true, runValidators: true }
  );
}

function buildDiscountCode(prefix = 'THANKYOU') {
  return `${String(prefix || 'THANKYOU').replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'THANKYOU'}-${createToken(4).toUpperCase()}`;
}

function previewCode(code) {
  const value = String(code || '');
  return value ? `${value.slice(0, Math.min(6, value.length))}…${value.slice(-4)}` : '';
}

function buildBasicDiscountInput(code, settings) {
  const value = Number(settings.reviewReward?.value || 10);
  const type = settings.reviewReward?.type || 'percentage';
  const input = {
    title: `Nectar review reward ${code}`,
    code,
    startsAt: new Date().toISOString(),
    customerSelection: { all: true },
    customerGets: {
      items: { all: true },
      value: type === 'fixed_amount'
        ? { discountAmount: { amount: String(Math.abs(value)), appliesOnEachItem: false } }
        : { percentage: Math.abs(value) / 100 }
    },
    appliesOncePerCustomer: Boolean(settings.reviewReward?.oncePerCustomer),
    usageLimit: settings.reviewReward?.usageLimit ? Number(settings.reviewReward.usageLimit) : 1
  };
  if (settings.reviewReward?.expiresAfterDays) {
    input.endsAt = new Date(Date.now() + Number(settings.reviewReward.expiresAfterDays) * 24 * 60 * 60 * 1000).toISOString();
  }
  return input;
}

async function createShopifyDiscountCodeWithGraphql(shopDomain, settings, code) {
  const mutation = `mutation CreateReviewRewardCode($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field code message }
    }
  }`;
  const data = await shopifyGraphql(shopDomain, mutation, { basicCodeDiscount: buildBasicDiscountInput(code, settings) });
  const payload = data?.discountCodeBasicCreate;
  const errors = payload?.userErrors || [];
  if (errors.length) {
    const error = new Error(errors.map((entry) => entry.message).join('; '));
    error.shopifyUserErrors = errors;
    throw error;
  }
  return { code, discountId: payload?.codeDiscountNode?.id || '' };
}

async function createShopifyDiscountCodeWithRestFallback(shopDomain, settings, code) {
  const value = Number(settings.reviewReward?.value || 10);
  const type = settings.reviewReward?.type || 'percentage';
  const priceRulePayload = {
    price_rule: {
      title: `Nectar review reward ${code}`,
      target_type: 'line_item',
      target_selection: 'all',
      allocation_method: 'across',
      value_type: type === 'fixed_amount' ? 'fixed_amount' : 'percentage',
      value: String(-Math.abs(value)),
      customer_selection: 'all',
      starts_at: new Date().toISOString(),
      once_per_customer: Boolean(settings.reviewReward?.oncePerCustomer),
      usage_limit: settings.reviewReward?.usageLimit ? Number(settings.reviewReward.usageLimit) : 1
    }
  };
  if (settings.reviewReward?.expiresAfterDays) {
    priceRulePayload.price_rule.ends_at = new Date(Date.now() + Number(settings.reviewReward.expiresAfterDays) * 24 * 60 * 60 * 1000).toISOString();
  }
  const rule = await shopifyFetch('/price_rules.json', { method: 'POST', shopDomain, body: priceRulePayload });
  const priceRuleId = rule?.price_rule?.id;
  if (!priceRuleId) throw new Error('Shopify did not return a price rule id.');
  await shopifyFetch(`/price_rules/${priceRuleId}/discount_codes.json`, {
    method: 'POST',
    shopDomain,
    body: { discount_code: { code } }
  });
  return { code, discountId: String(priceRuleId) };
}

async function createShopifyDiscountCode(shopDomain, settings, review = {}) {
  const cleanShop = cleanShopDomain(shopDomain);
  const reviewId = String(review?._id || review?.id || `manual-${Date.now()}`);
  const existing = await ReviewReward.findOne({ shopDomain: cleanShop, reviewId });
  if (existing) return { reward: existing, discountCode: '' };

  const code = buildDiscountCode(settings.reviewReward?.prefix);
  let result;
  try {
    result = await createShopifyDiscountCodeWithGraphql(cleanShop, settings, code);
  } catch (graphqlError) {
    console.warn('GraphQL discount creation failed, trying REST fallback:', graphqlError.message);
    result = await createShopifyDiscountCodeWithRestFallback(cleanShop, settings, code);
  }

  const record = await ReviewReward.create({
    shopDomain: cleanShop,
    reviewId,
    customerKey: String(review?.customerKey || ''),
    customerRef: publicCustomerRef(review?.customerKey),
    discountCodeHash: createScopedHash(cleanShop, result.code, 'discount_code'),
    discountCodePreview: previewCode(result.code),
    discountId: result.discountId,
    discountType: settings.reviewReward?.type || 'percentage',
    discountValue: Number(settings.reviewReward?.value || 10),
    metadata: { itemId: review?.itemId || '', source: review?.source || 'manual' }
  });
  return { reward: record, discountCode: result.code };
}

async function maybeRewardAcceptedReview({ shopDomain, review }) {
  const cleanShop = cleanShopDomain(shopDomain);
  if (!(await isModuleEnabled(cleanShop, 'discounts'))) return null;
  const settings = await getSettings(cleanShop);
  if (!settings.reviewReward?.enabled) return null;

  const existing = await ReviewReward.findOne({ shopDomain: cleanShop, reviewId: String(review._id || review.id) });
  if (existing) return existing;

  const { reward, discountCode } = await createShopifyDiscountCode(cleanShop, settings, review);
  await recordAuditEvent({ shopDomain: cleanShop, actorType: 'system', module: 'discounts', eventType: 'discount.review_reward.issued', entityType: 'review_reward', entityKey: String(reward._id), action: 'issue', metadata: { discountValue: reward.discountValue, discountType: reward.discountType } });
  eventBus.emit('discount.reviewReward.created', { shopDomain: cleanShop, review, reward: reward.toObject ? reward.toObject() : reward, discountCode });
  return reward;
}

async function listReviewRewards(shopDomain, limit = 100) {
  return ReviewReward.find({ shopDomain: cleanShopDomain(shopDomain) }).sort({ createdAt: -1 }).limit(Number(limit) || 100).lean();
}

async function markRewardSent(shopDomain, rewardId) {
  return ReviewReward.findOneAndUpdate(
    { _id: rewardId, shopDomain: cleanShopDomain(shopDomain) },
    { $set: { sentAt: new Date(), status: 'sent' } },
    { new: true }
  );
}

module.exports = {
  getSettings,
  updateSettings,
  maybeRewardAcceptedReview,
  createShopifyDiscountCode,
  buildDiscountCode,
  listReviewRewards,
  markRewardSent
};
