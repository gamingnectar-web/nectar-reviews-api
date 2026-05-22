const express = require('express');
const crypto = require('crypto');
const { cleanShopDomain, cleanText, cleanEmail, clampNumber } = require('../utils/validation');
const { env } = require('../config/env');
const { shopifyFetch } = require('../utils/shopify');
const {
  getOrCreateLoyaltyProgram,
  getCheckoutWallet,
  reserveCheckoutRedemption,
} = require('../modules/loyalty/loyalty.service');

const router = express.Router();

function getShopDomain(req) {
  return cleanShopDomain(req.body?.shopDomain || req.query?.shopDomain || req.headers['x-shopify-shop-domain'] || '');
}

function makeDiscountCode() {
  return `LOYALTY-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

async function createShopifyDiscountCode({ shopDomain, title, amount, valueType = 'fixed_amount', code }) {
  const startsAt = new Date().toISOString();
  const cleanValueType = valueType === 'percentage' ? 'percentage' : 'fixed_amount';
  const value = cleanValueType === 'percentage'
    ? `-${Math.min(100, Math.abs(Number(amount || 0))).toFixed(2)}`
    : `-${Math.abs(Number(amount || 0)).toFixed(2)}`;
  const priceRule = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/price_rules.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({
      price_rule: {
        title,
        target_type: 'line_item',
        target_selection: 'all',
        allocation_method: 'across',
        value_type: cleanValueType,
        value,
        customer_selection: 'all',
        once_per_customer: true,
        usage_limit: 1,
        starts_at: startsAt,
      },
    }),
  });
  const priceRuleId = priceRule?.price_rule?.id;
  if (!priceRuleId) throw new Error('Shopify price rule was not created.');
  await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/price_rules/${priceRuleId}/discount_codes.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ discount_code: { code } }),
  });
  return { code, priceRuleId };
}

router.get('/config', async (req, res, next) => {
  try {
    const shopDomain = getShopDomain(req);
    if (!shopDomain) return res.status(400).json({ error: 'Missing shopDomain.' });
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    const checkoutBeta = program.settings?.checkoutBeta || {};
    return res.json({
      enabled: Boolean(program.enabled && checkoutBeta.enabled),
      pointName: program.pointName || 'Points',
      label: checkoutBeta.betaLabel || 'Checkout points redemption beta',
      requireLoggedInCustomer: checkoutBeta.requireLoggedInCustomer !== false,
      minimumPointsToShow: Number(checkoutBeta.minimumPointsToShow || 1),
      note: checkoutBeta.betaNote || '',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/wallet', async (req, res, next) => {
  try {
    const shopDomain = getShopDomain(req);
    if (!shopDomain) return res.status(400).json({ error: 'Missing shopDomain.' });
    const wallet = await getCheckoutWallet({
      shopDomain,
      customerId: cleanText(req.body.customerId, 180),
      email: cleanEmail(req.body.email),
    });
    return res.json(wallet);
  } catch (error) {
    next(error);
  }
});

router.post('/redeem', async (req, res, next) => {
  try {
    const shopDomain = getShopDomain(req);
    if (!shopDomain) return res.status(400).json({ error: 'Missing shopDomain.' });
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    const rewardId = cleanText(req.body.rewardId, 80);
    const pointsToRedeem = clampNumber(req.body.pointsToRedeem, 0, 100000000, 0);
    const reward = (program.redemptionRewards || []).find((item) => item.id === rewardId && item.enabled !== false && item.betaCheckoutEnabled);
    if (!reward) return res.status(404).json({ error: 'Reward is not enabled for checkout beta.' });

    let discountCode = '';
    let discountError = '';
    const checkoutBeta = program.settings?.checkoutBeta || {};
    const shouldIssueNativeCode = Boolean(checkoutBeta.allowNativeDiscountCodes && reward.discountMode === 'native_discount_code');
    if (shouldIssueNativeCode) {
      try {
        discountCode = makeDiscountCode();
        await createShopifyDiscountCode({
          shopDomain,
          title: `Loyalty redemption ${discountCode}`,
          amount: pointsToRedeem > 0 ? Number(pointsToRedeem * Number(checkoutBeta.pointValueMinorUnits || 1) / 100) : Number(reward.discountValue || 0),
          valueType: reward.discountValueType || 'fixed_amount',
          code: discountCode,
        });
      } catch (error) {
        discountCode = '';
        discountError = error.message || 'Could not issue Shopify discount code.';
      }
    }

    if (shouldIssueNativeCode && !discountCode) {
      return res.status(409).json({
        error: 'Could not issue a Shopify checkout discount code for this beta redemption.',
        detail: discountError,
      });
    }

    const result = await reserveCheckoutRedemption({
      shopDomain,
      customerId: cleanText(req.body.customerId, 180),
      email: cleanEmail(req.body.email),
      rewardId,
      pointsToRedeem,
      cartTotal: clampNumber(req.body.cartTotal, 0, 100000000, 0),
      currencyCode: cleanText(req.body.currencyCode, 12),
      checkoutToken: cleanText(req.body.checkoutToken, 160),
      discountCode,
    });
    return res.status(201).json({
      ok: true,
      mode: discountCode ? 'native_discount_code' : 'reservation_only',
      discountCode,
      redemption: result.redemption,
      wallet: result.wallet,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
