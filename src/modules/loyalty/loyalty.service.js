const crypto = require('crypto');
const { getLoyaltyModels } = require('./loyalty.models');
const { cleanText, clampNumber } = require('../../utils/validation');
const { hashValue } = require('../../utils/crypto');

function makeId(prefix = 'rule') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function normaliseCustomerRef({ shopDomain, customerId = '', email = '' }) {
  const raw = cleanText(customerId, 180) || String(email || '').trim().toLowerCase();
  if (!shopDomain || !raw) return '';
  return hashValue(`${shopDomain}:${raw}`);
}

function customerHintFromHash(hash = '') {
  const value = String(hash || '');
  if (!value) return 'Customer';
  return `Customer ${value.slice(0, 4)}…${value.slice(-4)}`;
}

function customerHintFromRef({ shopDomain, customerId = '', email = '' }) {
  const hash = normaliseCustomerRef({ shopDomain, customerId, email });
  return customerHintFromHash(hash);
}

function defaultLoyaltyConfig(shopDomain) {
  return {
    shopDomain,
    enabled: false,
    privacyMode: 'hashed_customer_ref',
    pointName: 'Points',
    emailTemplates: [{ id: 'loyalty_email_primary', name: 'Reward ready', primary: true, status: 'primary', subject: 'Your reward is ready', heading: 'Your reward is ready', subtitle: 'Your loyalty reward is ready to use.', body: 'Thanks for being part of our rewards programme. Your {{ reward_type }} is now ready.', modules: [{ id: 'module_reward_box', type: 'reward_box', title: 'Reward unlocked', body: 'Use your reward on your next order.', backgroundColor: '#f8fafc', borderColor: '#e5e7eb', radius: 16, padding: 16, position: 'after_body' }], accentColor: '#111827', buttonText: 'Shop now' }],
    tiers: [{ id: 'bronze', name: 'Bronze', threshold: 0, multiplier: 1, perks: 'Entry tier' }, { id: 'silver', name: 'Silver', threshold: 500, multiplier: 1.2, perks: 'Earn 1.2x points' }, { id: 'gold', name: 'Gold', threshold: 1500, multiplier: 1.5, perks: 'Earn 1.5x points' }],
    redemptionRewards: [{ id: 'reward_checkout_discount', name: '£5 off coupon', type: 'discount', pointsCost: 500, discountValue: 5, enabled: true, betaCheckoutEnabled: true, discountMode: 'draft_only' }],
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
        conditions: [],
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
        purchaseMultiplierEligible: true,
        conditions: [],
      },
      {
        id: makeId('points'),
        name: 'Purchase points placeholder',
        enabled: false,
        trigger: 'purchase_completed',
        points: 1,
        delayDays: 0,
        verifiedOnly: false,
        minStars: 1,
        maxAwardsPerOrder: 0,
        purchaseMultiplierEligible: true,
        conditions: [],
      },
      {
        id: makeId('points'),
        name: 'Birthday points placeholder',
        enabled: false,
        trigger: 'birthday',
        points: 250,
        delayDays: 0,
        verifiedOnly: false,
        minStars: 1,
        maxAwardsPerOrder: 1,
        purchaseMultiplierEligible: false,
        conditions: [],
      },
    ],
    settings: {
      reuseCoreEmailProvider: true,
      pointsExpireAfterDays: 365,
      pendingMaturationEnabled: true,
      allowManualAdjustments: true,
      checkoutBeta: {
        enabled: false,
        betaLabel: 'Checkout points redemption beta',
        minimumPointsToShow: 1,
        maximumPointsPerCheckout: 5000,
        pointValueMinorUnits: 1,
        allowNativeDiscountCodes: false,
        requireLoggedInCustomer: true,
        allowPartialRedemption: true,
        betaNote: 'Customers must be logged in before checkout redemption appears.',
      },
    },
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

function cleanCondition(input = {}) {
  return {
    type: ['always', 'verified_review', 'min_stars', 'tier', 'purchase_count', 'birthday', 'manual'].includes(input.type) ? input.type : 'always',
    operator: cleanText(input.operator || 'is', 40),
    value: cleanText(input.value || '', 160),
  };
}

function cleanEmailTemplate(input = {}) {
  return {
    id: cleanText(input.id, 80) || makeId('loyalty_email'),
    name: cleanText(input.name || 'Reward ready', 120),
    primary: input.primary !== false,
    status: ['primary', 'draft', 'archived'].includes(input.status) ? input.status : (input.primary === false ? 'draft' : 'primary'),
    subject: cleanText(input.subject || 'Your reward is ready', 160),
    heading: cleanText(input.heading || 'Your reward is ready', 160),
    subtitle: cleanText(input.subtitle || 'A little thank-you from us.', 180),
    body: cleanText(input.body || 'Thanks for being part of our rewards programme. Your {{ reward_type }} is now ready.', 1200),
    modules: Array.isArray(input.modules) ? input.modules.slice(0, 12).map((module) => ({
      id: cleanText(module.id, 80) || makeId('email_module'),
      type: ['notice', 'reward_box', 'offer', 'support', 'text'].includes(module.type) ? module.type : 'notice',
      title: cleanText(module.title || 'Extra section', 120),
      body: cleanText(module.body || '', 600),
      backgroundColor: cleanText(module.backgroundColor || '#f8fafc', 20),
      borderColor: cleanText(module.borderColor || '#e5e7eb', 20),
      radius: clampNumber(module.radius, 0, 40, 16),
      padding: clampNumber(module.padding, 8, 40, 16),
      position: ['before_body', 'after_body', 'after_reward'].includes(module.position) ? module.position : 'after_body',
    })) : [],
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
    perks: cleanText(input.perks || '', 400),
    ruleIds: Array.isArray(input.ruleIds) ? input.ruleIds.slice(0, 30).map((id) => cleanText(id, 80)).filter(Boolean) : [],
    rewardIds: Array.isArray(input.rewardIds) ? input.rewardIds.slice(0, 30).map((id) => cleanText(id, 80)).filter(Boolean) : [],
    birthdayRewardEnabled: Boolean(input.birthdayRewardEnabled),
  };
}

function cleanRedemptionReward(input = {}) {
  return {
    id: cleanText(input.id, 80) || makeId('redeem'),
    name: cleanText(input.name || 'Checkout discount', 120),
    type: ['discount', 'catalogue_item', 'free_shipping'].includes(input.type) ? input.type : 'discount',
    pointsCost: clampNumber(input.pointsCost, 0, 100000000, 500),
    discountValue: clampNumber(input.discountValue, 0, 1000000, 5),
    enabled: input.enabled !== false,
    shopifyProductId: cleanText(input.shopifyProductId || '', 120),
    shopifyVariantId: cleanText(input.shopifyVariantId || '', 120),
    productTitle: cleanText(input.productTitle || '', 180),
    productImage: cleanText(input.productImage || '', 500),
    productHandle: cleanText(input.productHandle || '', 180),
    productPrice: clampNumber(input.productPrice, 0, 100000000, 0),
    redeemQuantity: clampNumber(input.redeemQuantity, 1, 1000000, 1),
    stockLimit: clampNumber(input.stockLimit, 0, 1000000, 0),
    minimumCartValue: clampNumber(input.minimumCartValue, 0, 100000000, 0),
    betaCheckoutEnabled: Boolean(input.betaCheckoutEnabled),
    discountMode: ['draft_only', 'native_discount_code'].includes(input.discountMode) ? input.discountMode : 'draft_only',
  };
}

function cleanRewardTemplate(input = {}) {
  return {
    id: cleanText(input.id, 80) || makeId('reward'),
    name: cleanText(input.name || 'Review thank-you discount', 120),
    enabled: Boolean(input.enabled),
    trigger: ['review_submitted', 'review_approved', 'purchase_completed', 'birthday', 'manual_adjustment'].includes(input.trigger) ? input.trigger : 'review_approved',
    discountType: input.discountType === 'fixed_amount' ? 'fixed_amount' : 'percentage',
    discountValue: clampNumber(input.discountValue, 1, 100000, 10),
    delayDays: clampNumber(input.delayDays, 0, 365, 0),
    verifiedOnly: input.verifiedOnly !== false,
    minStars: clampNumber(input.minStars, 1, 5, 1),
    reusableTemplate: input.reusableTemplate !== false,
    messageTemplate: cleanText(input.messageTemplate || 'Thanks for your review — here is {{ discount_value }}% off your next order.', 500),
    emailSubject: cleanText(input.emailSubject || 'Your review reward is ready', 160),
    emailBody: cleanText(input.emailBody || 'Thanks for leaving a review. Your {{ reward_type }} is now ready.', 1000),
    conditions: Array.isArray(input.conditions) ? input.conditions.slice(0, 10).map(cleanCondition) : [],
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
    purchaseMultiplierEligible: input.purchaseMultiplierEligible !== false,
    conditions: Array.isArray(input.conditions) ? input.conditions.slice(0, 10).map(cleanCondition) : [],
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
      ? body.pointsRules.slice(0, 30).map(cleanPointsRule)
      : defaults.pointsRules,
    settings: {
      reuseCoreEmailProvider: body.settings?.reuseCoreEmailProvider !== false,
      pointsExpireAfterDays: clampNumber(body.settings?.pointsExpireAfterDays, 0, 3650, 365),
      pendingMaturationEnabled: body.settings?.pendingMaturationEnabled !== false,
      allowManualAdjustments: body.settings?.allowManualAdjustments !== false,
      checkoutBeta: {
        enabled: Boolean(body.settings?.checkoutBeta?.enabled),
        betaLabel: cleanText(body.settings?.checkoutBeta?.betaLabel || defaults.settings.checkoutBeta.betaLabel, 120),
        minimumPointsToShow: clampNumber(body.settings?.checkoutBeta?.minimumPointsToShow, 0, 100000000, 1),
        maximumPointsPerCheckout: clampNumber(body.settings?.checkoutBeta?.maximumPointsPerCheckout, 0, 100000000, 5000),
        pointValueMinorUnits: clampNumber(body.settings?.checkoutBeta?.pointValueMinorUnits, 0, 1000000, 1),
        allowNativeDiscountCodes: Boolean(body.settings?.checkoutBeta?.allowNativeDiscountCodes),
        requireLoggedInCustomer: body.settings?.checkoutBeta?.requireLoggedInCustomer !== false,
        allowPartialRedemption: body.settings?.checkoutBeta?.allowPartialRedemption !== false,
        betaNote: cleanText(body.settings?.checkoutBeta?.betaNote || defaults.settings.checkoutBeta.betaNote, 260),
      },
    },
  };
}

function getTierForPoints(program, totalEarned) {
  const tiers = Array.isArray(program?.tiers) && program.tiers.length ? program.tiers : defaultLoyaltyConfig(program?.shopDomain || '').tiers;
  return [...tiers]
    .sort((a, b) => Number(b.threshold || 0) - Number(a.threshold || 0))
    .find((tier) => Number(totalEarned || 0) >= Number(tier.threshold || 0)) || tiers[0];
}

async function recalculateCustomerState(shopDomain, customerRefHash) {
  const { LoyaltyProgram, LoyaltyLedger, LoyaltyCustomerState } = getLoyaltyModels();
  const [program, rows] = await Promise.all([
    LoyaltyProgram.findOne({ shopDomain }).lean(),
    LoyaltyLedger.find({ shopDomain, customerRefHash }).lean(),
  ]);
  let availablePoints = 0;
  let pendingPoints = 0;
  let totalEarned = 0;
  let totalRedeemed = 0;
  let lastActivityAt = null;
  rows.forEach((row) => {
    const points = Number(row.points || 0);
    if (row.status === 'available' || row.status === 'reserved' || row.status === 'issued') availablePoints += points;
    if (row.status === 'pending') pendingPoints += points;
    if (points > 0 && !['cancelled', 'expired'].includes(row.status)) totalEarned += points;
    if (points < 0 || row.eventType === 'redemption' || row.eventType === 'checkout_redemption' || row.status === 'redeemed') totalRedeemed += Math.abs(Math.min(0, points));
    const date = row.updatedAt || row.createdAt || row.availableAt;
    if (date && (!lastActivityAt || new Date(date) > new Date(lastActivityAt))) lastActivityAt = date;
  });
  availablePoints = Math.max(0, Math.round(availablePoints));
  pendingPoints = Math.max(0, Math.round(pendingPoints));
  const tier = getTierForPoints(program || {}, totalEarned);
  return LoyaltyCustomerState.findOneAndUpdate(
    { shopDomain, customerRefHash },
    {
      $set: {
        shopDomain,
        customerRefHash,
        customerRefHint: customerHintFromHash(customerRefHash),
        availablePoints,
        pendingPoints,
        totalEarned,
        totalRedeemed,
        currentTierId: tier?.id || 'bronze',
        currentTierName: tier?.name || 'Bronze',
        lastActivityAt: lastActivityAt || new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function listCustomerStates(shopDomain, { limit = 50, search = '' } = {}) {
  const { LoyaltyCustomerState } = getLoyaltyModels();
  const query = { shopDomain };
  if (search) query.customerRefHint = { $regex: cleanText(search, 80), $options: 'i' };
  return LoyaltyCustomerState.find(query).sort({ lastActivityAt: -1 }).limit(clampNumber(limit, 1, 200, 50)).lean();
}

async function createLedgerEntry(event) {
  const { LoyaltyLedger } = getLoyaltyModels();
  const row = await LoyaltyLedger.create({
    ...event,
    customerRefHint: event.customerRefHint || customerHintFromHash(event.customerRefHash),
  });
  await recalculateCustomerState(event.shopDomain, event.customerRefHash);
  return row;
}

async function maturePendingPoints(shopDomain) {
  const { LoyaltyLedger } = getLoyaltyModels();
  const rows = await LoyaltyLedger.find({ shopDomain, status: 'pending', availableAt: { $lte: new Date() } }).lean();
  if (!rows.length) return { matured: 0 };
  const ids = rows.map((row) => row._id);
  await LoyaltyLedger.updateMany({ _id: { $in: ids } }, { $set: { status: 'available', awardedAt: new Date() } });
  const customerHashes = [...new Set(rows.map((row) => row.customerRefHash))];
  for (const customerRefHash of customerHashes) await recalculateCustomerState(shopDomain, customerRefHash);
  return { matured: rows.length };
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
  const sourceReviewHash = hashValue(`${shopDomain}:review:${String(review._id)}`);

  (program.pointsRules || []).forEach((rule) => {
    if (rule.trigger !== trigger || !reviewMatchesRule(review, rule)) return;
    availableEvents.push({
      shopDomain,
      customerRefHash,
      customerRefHint: customerHintFromHash(customerRefHash),
      eventType: 'points_award',
      source: 'review',
      sourceReviewHash,
      orderIdHash: review.orderId ? hashValue(`${shopDomain}:${review.orderId}`) : '',
      itemId: String(review.itemId || ''),
      points: Number(rule.points || 0),
      status: Number(rule.delayDays || 0) > 0 ? 'pending' : 'available',
      availableAt: new Date(now + Number(rule.delayDays || 0) * 24 * 60 * 60 * 1000),
      awardedAt: Number(rule.delayDays || 0) > 0 ? null : new Date(),
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
      customerRefHint: customerHintFromHash(customerRefHash),
      eventType: 'discount_reward',
      source: 'review',
      sourceReviewHash,
      orderIdHash: review.orderId ? hashValue(`${shopDomain}:${review.orderId}`) : '',
      itemId: String(review.itemId || ''),
      discountType: template.discountType,
      discountValue: Number(template.discountValue || 0),
      status: Number(template.delayDays || 0) > 0 ? 'pending' : 'available',
      availableAt: new Date(now + Number(template.delayDays || 0) * 24 * 60 * 60 * 1000),
      awardedAt: Number(template.delayDays || 0) > 0 ? null : new Date(),
      ruleId: template.id,
      ruleName: template.name,
      privateNote: `Generated by ${template.name}. Discount code creation is deferred to Shopify discount integration.`,
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
    await createLedgerEntry(event);
    created += 1;
  }
  return { created };
}


function getCheckoutBetaSettings(program = {}) {
  const defaults = defaultLoyaltyConfig(program.shopDomain || '').settings.checkoutBeta;
  return { ...defaults, ...(program.settings?.checkoutBeta || {}) };
}

async function getCheckoutWallet({ shopDomain, customerId = '', email = '' }) {
  const program = await getOrCreateLoyaltyProgram(shopDomain);
  const checkoutBeta = getCheckoutBetaSettings(program);
  if (!program.enabled || !checkoutBeta.enabled) {
    return { enabled: false, reason: 'checkout_beta_disabled', pointName: program.pointName || 'Points', availablePoints: 0, pendingPoints: 0, rewards: [] };
  }
  const customerRefHash = normaliseCustomerRef({ shopDomain, customerId, email });
  if (!customerRefHash) {
    return { enabled: false, reason: 'customer_not_signed_in', pointName: program.pointName || 'Points', availablePoints: 0, pendingPoints: 0, rewards: [] };
  }
  await maturePendingPoints(shopDomain).catch(() => null);
  const state = await recalculateCustomerState(shopDomain, customerRefHash);
  const rewards = (program.redemptionRewards || [])
    .filter((reward) => reward.enabled !== false && reward.betaCheckoutEnabled)
    .map((reward) => ({
      id: reward.id,
      name: reward.name,
      type: reward.type,
      pointsCost: Number(reward.pointsCost || 0),
      discountValue: Number(reward.discountValue || 0),
      minimumCartValue: Number(reward.minimumCartValue || 0),
      shopifyProductId: reward.shopifyProductId || '',
      shopifyVariantId: reward.shopifyVariantId || '',
      productTitle: reward.productTitle || '',
      productImage: reward.productImage || '',
      productHandle: reward.productHandle || '',
      productPrice: Number(reward.productPrice || 0),
      redeemQuantity: Number(reward.redeemQuantity || 1),
      stockLimit: Number(reward.stockLimit || 0),
      discountMode: reward.discountMode || 'draft_only',
      canRedeem: checkoutBeta.allowPartialRedemption ? Number(state.availablePoints || 0) >= Number(checkoutBeta.minimumPointsToShow || 1) : Number(state.availablePoints || 0) >= Number(reward.pointsCost || 0),
    }));
  return {
    enabled: true,
    pointName: program.pointName || 'Points',
    checkoutBeta,
    customerRefHash,
    customerRefHint: customerHintFromHash(customerRefHash),
    availablePoints: Number(state.availablePoints || 0),
    pendingPoints: Number(state.pendingPoints || 0),
    currentTierName: state.currentTierName || 'Bronze',
    rewards,
  };
}

async function reserveCheckoutRedemption({ shopDomain, customerId = '', email = '', rewardId = '', pointsToRedeem = 0, cartTotal = 0, currencyCode = '', checkoutToken = '', discountCode = '' }) {
  const { LoyaltyRedemption } = getLoyaltyModels();
  const wallet = await getCheckoutWallet({ shopDomain, customerId, email });
  if (!wallet.enabled) {
    const error = new Error(wallet.reason === 'customer_not_signed_in' ? 'Customer must be signed in to redeem points.' : 'Checkout redemption beta is not enabled.');
    error.status = 403;
    throw error;
  }
  const program = await getOrCreateLoyaltyProgram(shopDomain);
  const checkoutBeta = getCheckoutBetaSettings(program);
  const reward = (program.redemptionRewards || []).find((item) => item.id === rewardId && item.enabled !== false && item.betaCheckoutEnabled);
  if (!reward) {
    const error = new Error('This reward is not enabled for checkout beta redemption.');
    error.status = 404;
    throw error;
  }
  if (Number(cartTotal || 0) < Number(reward.minimumCartValue || 0)) {
    const error = new Error('Cart value is below this reward minimum.');
    error.status = 400;
    throw error;
  }
  const requestedPoints = clampNumber(pointsToRedeem, 0, 100000000, 0);
  const baseCost = Number(reward.pointsCost || 0);
  const pointsCost = checkoutBeta.allowPartialRedemption && requestedPoints > 0
    ? Math.min(requestedPoints, Number(wallet.availablePoints || 0), Number(checkoutBeta.maximumPointsPerCheckout || requestedPoints))
    : Math.min(baseCost, Number(checkoutBeta.maximumPointsPerCheckout || baseCost));
  if (!pointsCost || pointsCost <= 0) {
    const error = new Error('Enter how many points to redeem.');
    error.status = 400;
    throw error;
  }
  if (Number(wallet.availablePoints || 0) < pointsCost) {
    const error = new Error(`Not enough ${program.pointName || 'Points'} for this reward.`);
    error.status = 400;
    throw error;
  }
  const checkoutTokenHash = checkoutToken ? hashValue(`${shopDomain}:checkout:${checkoutToken}`) : '';
  const now = new Date();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const row = await createLedgerEntry({
    shopDomain,
    customerRefHash: wallet.customerRefHash,
    customerRefHint: wallet.customerRefHint,
    eventType: 'checkout_redemption',
    source: 'checkout_beta',
    points: -Math.abs(pointsCost),
    status: 'reserved',
    availableAt: now,
    awardedAt: now,
    ruleId: reward.id,
    ruleName: `Checkout redemption: ${reward.name}`,
    privateNote: 'Reserved by checkout beta. Confirmed redemption should be reconciled against Shopify order/discount usage.',
  });
  const redemption = await LoyaltyRedemption.create({
    shopDomain,
    customerRefHash: wallet.customerRefHash,
    rewardId: reward.id,
    rewardName: reward.name,
    pointsCost,
    pointsReserved: pointsCost,
    discountAmount: checkoutBeta.allowPartialRedemption ? Number(pointsCost * Number(checkoutBeta.pointValueMinorUnits || 1) / 100) : Number(reward.discountValue || 0),
    currencyCode: cleanText(currencyCode || '', 12),
    status: discountCode ? 'issued' : 'reserved',
    shopifyDiscountCode: cleanText(discountCode || '', 80),
    checkoutSessionId: cleanText(checkoutToken || '', 120),
    checkoutTokenHash,
    expiresAt,
    issuedAt: discountCode ? now : null,
    privateNote: discountCode ? 'Native Shopify discount code issued by checkout beta.' : 'Reserved without issuing a native discount code.',
  });
  return { row, redemption, wallet: await getCheckoutWallet({ shopDomain, customerId, email }) };
}

module.exports = {
  makeId,
  normaliseCustomerRef,
  customerHintFromHash,
  customerHintFromRef,
  defaultLoyaltyConfig,
  getOrCreateLoyaltyProgram,
  cleanLoyaltyConfig,
  cleanRewardTemplate,
  cleanPointsRule,
  cleanEmailTemplate,
  cleanTier,
  cleanRedemptionReward,
  recalculateCustomerState,
  listCustomerStates,
  createLedgerEntry,
  maturePendingPoints,
  awardForReview,
  getCheckoutBetaSettings,
  getCheckoutWallet,
  reserveCheckoutRedemption,
};
