const crypto = require('crypto');
const { getLoyaltyModels } = require('./loyalty.models');
const { cleanText, clampNumber } = require('../../utils/validation');
const { hashValue } = require('../../utils/crypto');

function makeId(prefix = 'rule') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function normaliseCustomerRef({ shopDomain, customerId = '', email = '' }) {
  const raw = cleanText(customerId, 160) || String(email || '').trim().toLowerCase();
  if (!shopDomain || !raw) return '';
  return hashValue(`${shopDomain}:${raw}`);
}

function defaultLoyaltyConfig(shopDomain) {
  return {
    shopDomain,
    enabled: false,
    privacyMode: 'hashed_customer_ref',
    pointName: 'Nectar Points',
    emailTemplates: [{ id: 'loyalty_email_primary', name: 'Reward ready', primary: true, status: 'primary', subject: 'Your review reward is ready', heading: 'Your reward is ready', body: 'Thanks for leaving a review. Your {{ reward_type }} is now ready.', accentColor: '#111827', buttonText: 'Shop now' }],
    tiers: [{ id: 'bronze', name: 'Bronze', threshold: 0, multiplier: 1 }, { id: 'silver', name: 'Silver', threshold: 500, multiplier: 1.2 }, { id: 'gold', name: 'Gold', threshold: 1500, multiplier: 1.5 }],
    redemptionRewards: [{ id: 'reward_checkout_discount', name: '£5 off coupon', type: 'discount', pointsCost: 500, discountValue: 5, enabled: true }],
    rewardTemplates: [
      {
        id: makeId('reward'),
        name: 'Review thank-you discount',
        enabled: false,
        trigger: 'review_approved',
        discountType: 'percentage',
        discountValue: 10,
        delayDays: 0,
        verifiedOnly: true,
        minStars: 1,
        reusableTemplate: true,
        messageTemplate: 'Thanks for your review — here is {{ discount_value }}% off your next order.',
        emailSubject: 'Your review reward is ready',
        emailBody: 'Thanks for leaving a review. Your {{ reward_type }} is now ready.',
      },
    ],
    pointsRules: [
      {
        id: makeId('points'),
        name: 'Review approved points',
        enabled: false,
        trigger: 'review_approved',
        points: 100,
        delayDays: 28,
        verifiedOnly: true,
        minStars: 1,
        maxAwardsPerOrder: 1,
      },
    ],
  };
}

async function getOrCreateLoyaltyProgram(shopDomain) {
  const { LoyaltyProgram } = getLoyaltyModels();
  let program = await LoyaltyProgram.findOne({ shopDomain });
  if (program) return program;
  const defaults = defaultLoyaltyConfig(shopDomain);
  program = await LoyaltyProgram.findOneAndUpdate(
    { shopDomain },
    { $setOnInsert: defaults },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return program;
}


function cleanEmailTemplate(input = {}) {
  return {
    id: cleanText(input.id, 80) || makeId('loyalty_email'),
    name: cleanText(input.name || 'Reward ready', 120),
    primary: input.primary !== false,
    status: ['primary', 'draft', 'archived'].includes(input.status) ? input.status : (input.primary === false ? 'draft' : 'primary'),
    subject: cleanText(input.subject || 'Your review reward is ready', 160),
    heading: cleanText(input.heading || 'Your reward is ready', 160),
    body: cleanText(input.body || 'Thanks for leaving a review. Your {{ reward_type }} is now ready.', 1200),
    accentColor: cleanText(input.accentColor || '#111827', 20),
    buttonText: cleanText(input.buttonText || 'Shop now', 80),
  };
}

function cleanTier(input = {}) {
  return {
    id: cleanText(input.id, 80) || makeId('tier'),
    name: cleanText(input.name || 'Tier', 80),
    threshold: clampNumber(input.threshold, 0, 100000000, 0),
    multiplier: clampNumber(input.multiplier, 0, 100, 1),
  };
}

function cleanRedemptionReward(input = {}) {
  return {
    id: cleanText(input.id, 80) || makeId('redeem'),
    name: cleanText(input.name || 'Checkout discount', 120),
    type: input.type === 'catalogue_item' ? 'catalogue_item' : 'discount',
    pointsCost: clampNumber(input.pointsCost, 0, 100000000, 500),
    discountValue: clampNumber(input.discountValue, 0, 1000000, 5),
    enabled: input.enabled !== false,
  };
}

function cleanRewardTemplate(input = {}) {
  return {
    id: cleanText(input.id, 80) || makeId('reward'),
    name: cleanText(input.name || 'Review thank-you discount', 120),
    enabled: Boolean(input.enabled),
    trigger: ['review_submitted', 'review_approved', 'purchase_completed', 'birthday', 'manual_adjustment'].includes(input.trigger) ? input.trigger : 'review_approved',
    discountType: input.discountType === 'fixed_amount' ? 'fixed_amount' : 'percentage',
    discountValue: clampNumber(input.discountValue, 1, 100, 10),
    delayDays: clampNumber(input.delayDays, 0, 365, 0),
    verifiedOnly: input.verifiedOnly !== false,
    minStars: clampNumber(input.minStars, 1, 5, 1),
    reusableTemplate: input.reusableTemplate !== false,
    messageTemplate: cleanText(input.messageTemplate || 'Thanks for your review — here is {{ discount_value }}% off your next order.', 500),
    emailSubject: cleanText(input.emailSubject || 'Your review reward is ready', 160),
    emailBody: cleanText(input.emailBody || 'Thanks for leaving a review. Your {{ reward_type }} is now ready.', 1000),
  };
}

function cleanPointsRule(input = {}) {
  return {
    id: cleanText(input.id, 80) || makeId('points'),
    name: cleanText(input.name || 'Review approved points', 120),
    enabled: Boolean(input.enabled),
    trigger: ['review_submitted', 'review_approved', 'purchase_completed', 'birthday', 'manual_adjustment'].includes(input.trigger) ? input.trigger : 'review_approved',
    points: clampNumber(input.points, 1, 100000, 100),
    delayDays: clampNumber(input.delayDays, 0, 365, 28),
    verifiedOnly: input.verifiedOnly !== false,
    minStars: clampNumber(input.minStars, 1, 5, 1),
    maxAwardsPerOrder: clampNumber(input.maxAwardsPerOrder, 0, 50, 1),
  };
}

function cleanLoyaltyConfig(shopDomain, body = {}) {
  const defaults = defaultLoyaltyConfig(shopDomain);
  return {
    shopDomain,
    enabled: Boolean(body.enabled),
    privacyMode: 'hashed_customer_ref',
    pointName: cleanText(body.pointName || defaults.pointName, 80),
    emailTemplates: Array.isArray(body.emailTemplates)
      ? body.emailTemplates.slice(0, 20).map(cleanEmailTemplate)
      : defaults.emailTemplates,
    tiers: Array.isArray(body.tiers)
      ? body.tiers.slice(0, 10).map(cleanTier)
      : defaults.tiers,
    redemptionRewards: Array.isArray(body.redemptionRewards)
      ? body.redemptionRewards.slice(0, 20).map(cleanRedemptionReward)
      : defaults.redemptionRewards,
    rewardTemplates: Array.isArray(body.rewardTemplates)
      ? body.rewardTemplates.slice(0, 20).map(cleanRewardTemplate)
      : defaults.rewardTemplates,
    pointsRules: Array.isArray(body.pointsRules)
      ? body.pointsRules.slice(0, 20).map(cleanPointsRule)
      : defaults.pointsRules,
  };
}

function reviewMatchesRule(review, rule) {
  if (!rule?.enabled) return false;
  if (Number(review.rating || 0) < Number(rule.minStars || 1)) return false;
  if (rule.verifiedOnly && !review.verifiedPurchase) return false;
  return true;
}

async function awardForReview({ shopDomain, review, trigger }) {
  const { LoyaltyProgram, LoyaltyLedger } = getLoyaltyModels();
  const program = await LoyaltyProgram.findOne({ shopDomain }).lean();
  if (!program?.enabled || !review || review.isTestReview || review.testMode) return { created: 0 };

  const customerRefHash = normaliseCustomerRef({ shopDomain, customerId: review.customerId, email: review.email });
  if (!customerRefHash) return { created: 0, skipped: 'no_customer_ref' };

  const availableEvents = [];
  const now = Date.now();

  (program.pointsRules || []).forEach((rule) => {
    if (rule.trigger !== trigger || !reviewMatchesRule(review, rule)) return;
    availableEvents.push({
      shopDomain,
      customerRefHash,
      eventType: 'points_award',
      source: 'review',
      sourceReviewHash: hashValue(`${shopDomain}:review:${String(review._id)}`),
      orderIdHash: review.orderId ? hashValue(`${shopDomain}:${review.orderId}`) : '',
      itemId: String(review.itemId || ''),
      points: Number(rule.points || 0),
      status: Number(rule.delayDays || 0) > 0 ? 'pending' : 'available',
      availableAt: new Date(now + Number(rule.delayDays || 0) * 24 * 60 * 60 * 1000),
      ruleId: rule.id,
      ruleName: rule.name,
      privateNote: `Generated by ${rule.name}. No customer email/name stored in loyalty ledger.`,
    });
  });

  (program.rewardTemplates || []).forEach((template) => {
    if (template.trigger !== trigger || !reviewMatchesRule(review, template)) return;
    availableEvents.push({
      shopDomain,
      customerRefHash,
      eventType: 'discount_reward',
      source: 'review',
      sourceReviewHash: hashValue(`${shopDomain}:review:${String(review._id)}`),
      orderIdHash: review.orderId ? hashValue(`${shopDomain}:${review.orderId}`) : '',
      itemId: String(review.itemId || ''),
      discountType: template.discountType,
      discountValue: Number(template.discountValue || 0),
      status: Number(template.delayDays || 0) > 0 ? 'pending' : 'available',
      availableAt: new Date(now + Number(template.delayDays || 0) * 24 * 60 * 60 * 1000),
      ruleId: template.id,
      ruleName: template.name,
      privateNote: `Generated by ${template.name}. Discount code creation is intentionally deferred to Shopify discount integration.`,
    });
  });

  let created = 0;
  for (const event of availableEvents) {
    const existing = await LoyaltyLedger.findOne({
      shopDomain,
      customerRefHash,
      sourceReviewHash: event.sourceReviewHash,
      ruleId: event.ruleId,
      eventType: event.eventType,
    }).lean();
    if (existing) continue;
    await LoyaltyLedger.create(event);
    created += 1;
  }
  return { created };
}

module.exports = {
  makeId,
  normaliseCustomerRef,
  defaultLoyaltyConfig,
  getOrCreateLoyaltyProgram,
  cleanLoyaltyConfig,
  cleanRewardTemplate,
  cleanPointsRule,
  cleanEmailTemplate,
  cleanTier,
  cleanRedemptionReward,
  awardForReview,
};
