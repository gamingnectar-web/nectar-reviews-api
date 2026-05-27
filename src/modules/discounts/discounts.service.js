const crypto = require('crypto');
const { env } = require('../../config/env');
const { shopifyFetchOptional } = require('../../utils/shopify');
const { cleanText, cleanEmail, clampNumber } = require('../../utils/validation');
const { DiscountProgram, DiscountIssue } = require('./discounts.models');

function makeId(prefix = 'discount') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function makeDiscountCode(prefix = 'NECTAR') {
  const cleanPrefix = String(prefix || 'NECTAR').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 14) || 'NECTAR';
  return `${cleanPrefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

function defaultDiscountTemplates() {
  return [
    {
      id: 'review_milestone_10',
      name: '10th review reward',
      enabled: false,
      area: 'reviews',
      trigger: 'review_milestone',
      milestoneCount: 10,
      codePrefix: 'REVIEW10',
      method: 'draft_only',
      discountType: 'percentage',
      discountValue: 10,
      appliesTo: 'all_products',
      minimumSubtotal: 0,
      usageLimit: 1,
      oncePerCustomer: true,
      emailSubject: 'Thanks for your reviews — here is a reward',
      emailBody: 'Thanks for sharing feedback with us. Use {{ code }} for {{ discount_value }} off.',
      conditions: [{ type: 'review_count', operator: 'gte', value: '10' }],
    },
    {
      id: 'loyalty_checkout_default',
      name: 'Loyalty checkout redemption',
      enabled: true,
      area: 'loyalty',
      trigger: 'loyalty_redemption',
      codePrefix: 'LOYALTY',
      method: 'draft_only',
      discountType: 'fixed_amount',
      discountValue: 5,
      appliesTo: 'all_products',
      minimumSubtotal: 0,
      usageLimit: 1,
      oncePerCustomer: true,
      emailSubject: 'Your loyalty discount is ready',
      emailBody: 'Your loyalty reward code is {{ code }}.',
      conditions: [{ type: 'loyalty_balance', operator: 'gte', value: '500' }],
    },
    {
      id: 'cart_reward_default',
      name: 'Cart reward discount',
      enabled: false,
      area: 'cart_rewards',
      trigger: 'cart_reward_claimed',
      codePrefix: 'CART',
      method: 'draft_only',
      discountType: 'fixed_amount',
      discountValue: 5,
      appliesTo: 'all_products',
      minimumSubtotal: 50,
      usageLimit: 1,
      oncePerCustomer: false,
      emailSubject: 'Your cart reward is ready',
      emailBody: 'Use {{ code }} on this order.',
      conditions: [{ type: 'cart_value', operator: 'gte', value: '50' }],
    },
  ];
}

function defaultDiscountConfig(shopDomain) {
  return {
    shopDomain,
    enabled: false,
    defaultMethod: 'draft_only',
    defaultExpiryDays: 30,
    templates: defaultDiscountTemplates(),
    settings: {
      allowReviewMilestones: true,
      allowLoyaltyRedemptions: true,
      allowCartRewards: true,
      requireShopifyDiscountScope: true,
    },
  };
}

function cleanCondition(input = {}) {
  return {
    type: ['always', 'review_count', 'verified_review', 'min_stars', 'loyalty_tier', 'loyalty_balance', 'cart_value', 'customer_tag', 'product_tag', 'manual'].includes(input.type) ? input.type : 'always',
    operator: cleanText(input.operator || 'is', 40),
    value: cleanText(input.value || '', 160),
  };
}

function cleanTemplate(input = {}) {
  return {
    id: cleanText(input.id, 100) || makeId('discount_template'),
    name: cleanText(input.name || 'Reward discount', 140),
    enabled: input.enabled !== false,
    area: ['reviews', 'loyalty', 'cart_rewards', 'referrals', 'manual', 'general'].includes(input.area) ? input.area : 'general',
    trigger: ['manual', 'review_submitted', 'review_approved', 'review_milestone', 'loyalty_redemption', 'checkout_redemption', 'cart_reward_claimed', 'referral_completed'].includes(input.trigger) ? input.trigger : 'manual',
    milestoneCount: clampNumber(input.milestoneCount, 0, 1000000, 0),
    codePrefix: cleanText(input.codePrefix || 'NECTAR', 20).replace(/[^a-z0-9]/gi, '').toUpperCase() || 'NECTAR',
    method: ['draft_only', 'native_shopify_code'].includes(input.method) ? input.method : 'draft_only',
    discountType: ['percentage', 'fixed_amount', 'free_shipping'].includes(input.discountType) ? input.discountType : 'percentage',
    discountValue: clampNumber(input.discountValue, 0, 1000000, 10),
    appliesTo: ['all_products', 'specific_products', 'specific_collections', 'shipping'].includes(input.appliesTo) ? input.appliesTo : 'all_products',
    productIds: Array.isArray(input.productIds) ? input.productIds.slice(0, 100).map((x) => cleanText(x, 160)).filter(Boolean) : [],
    collectionIds: Array.isArray(input.collectionIds) ? input.collectionIds.slice(0, 100).map((x) => cleanText(x, 160)).filter(Boolean) : [],
    minimumSubtotal: clampNumber(input.minimumSubtotal, 0, 10000000, 0),
    usageLimit: clampNumber(input.usageLimit, 0, 1000000, 1),
    oncePerCustomer: input.oncePerCustomer !== false,
    customerSelection: input.customerSelection === 'specific_customers' ? 'specific_customers' : 'all',
    startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    emailSubject: cleanText(input.emailSubject || 'Your discount is ready', 160),
    emailBody: cleanText(input.emailBody || 'Thanks — your reward code is {{ code }}.', 1000),
    conditions: Array.isArray(input.conditions) ? input.conditions.slice(0, 20).map(cleanCondition) : [],
  };
}

function cleanDiscountConfig(shopDomain, body = {}) {
  const defaults = defaultDiscountConfig(shopDomain);
  return {
    shopDomain,
    enabled: Boolean(body.enabled),
    defaultMethod: ['draft_only', 'native_shopify_code'].includes(body.defaultMethod) ? body.defaultMethod : defaults.defaultMethod,
    defaultExpiryDays: clampNumber(body.defaultExpiryDays, 0, 730, defaults.defaultExpiryDays),
    templates: Array.isArray(body.templates) ? body.templates.slice(0, 50).map(cleanTemplate) : defaults.templates,
    settings: {
      allowReviewMilestones: body.settings?.allowReviewMilestones !== false,
      allowLoyaltyRedemptions: body.settings?.allowLoyaltyRedemptions !== false,
      allowCartRewards: body.settings?.allowCartRewards !== false,
      requireShopifyDiscountScope: body.settings?.requireShopifyDiscountScope !== false,
    },
  };
}

async function getOrCreateDiscountProgram(shopDomain) {
  let program = await DiscountProgram.findOne({ shopDomain });
  if (program) return program;
  return DiscountProgram.findOneAndUpdate(
    { shopDomain },
    { $setOnInsert: defaultDiscountConfig(shopDomain) },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function shopifyPriceRulePayload(template, code, expiresAt) {
  const discountType = template.discountType === 'free_shipping' ? 'free_shipping' : template.discountType;
  const valueType = discountType === 'percentage' ? 'percentage' : 'fixed_amount';
  const value = discountType === 'free_shipping'
    ? '-100.00'
    : valueType === 'percentage'
      ? `-${Math.min(100, Math.abs(Number(template.discountValue || 0))).toFixed(2)}`
      : `-${Math.abs(Number(template.discountValue || 0)).toFixed(2)}`;
  const targetType = discountType === 'free_shipping' ? 'shipping_line' : 'line_item';
  const payload = {
    title: `${template.name || 'Nectar discount'} ${code}`,
    target_type: targetType,
    target_selection: 'all',
    allocation_method: discountType === 'free_shipping' ? 'each' : 'across',
    value_type: valueType,
    value,
    customer_selection: template.customerSelection === 'specific_customers' ? 'prerequisite' : 'all',
    once_per_customer: Boolean(template.oncePerCustomer),
    usage_limit: Number(template.usageLimit || 1) || undefined,
    starts_at: new Date(template.startsAt || Date.now()).toISOString(),
    ends_at: expiresAt ? new Date(expiresAt).toISOString() : (template.endsAt ? new Date(template.endsAt).toISOString() : undefined),
  };
  if (Number(template.minimumSubtotal || 0) > 0) {
    payload.prerequisite_subtotal_range = { greater_than_or_equal_to: String(Number(template.minimumSubtotal || 0).toFixed(2)) };
  }
  return payload;
}

async function createNativeShopifyDiscountCode({ shopDomain, template, code, expiresAt }) {
  const priceRule = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/price_rules.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ price_rule: shopifyPriceRulePayload(template, code, expiresAt) }),
  });
  const priceRuleId = priceRule?.price_rule?.id;
  if (!priceRuleId) throw new Error('Shopify discount price rule was not created. Check write_discounts/write_price_rules scopes.');
  const discount = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/price_rules/${priceRuleId}/discount_codes.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ discount_code: { code } }),
  });
  if (!discount?.discount_code?.id) throw new Error('Shopify discount code was not created.');
  return { priceRuleId: String(priceRuleId), discountCodeId: String(discount.discount_code.id) };
}

async function issueDiscountCode({ shopDomain, templateId = '', area = 'general', trigger = 'manual', sourceId = '', customerRefHash = '', email = '', override = {} }) {
  const program = await getOrCreateDiscountProgram(shopDomain);
  const templates = Array.isArray(program.templates) && program.templates.length ? program.templates : defaultDiscountTemplates();
  const base = templates.find((item) => item.id === templateId) || templates.find((item) => item.area === area && item.trigger === trigger && item.enabled !== false) || templates[0];
  const template = cleanTemplate({ ...base, ...override });
  const code = cleanText(override.code || makeDiscountCode(template.codePrefix), 80);
  const expiresAt = override.expiresAt ? new Date(override.expiresAt) : Number(program.defaultExpiryDays || 0) > 0 ? new Date(Date.now() + Number(program.defaultExpiryDays || 0) * 24 * 60 * 60 * 1000) : null;
  const issue = await DiscountIssue.create({
    shopDomain,
    templateId: template.id,
    templateName: template.name,
    area: template.area || area,
    trigger: template.trigger || trigger,
    code,
    method: template.method,
    discountType: template.discountType,
    discountValue: Number(template.discountValue || 0),
    status: template.method === 'native_shopify_code' ? 'draft' : 'draft',
    sourceId: cleanText(sourceId, 180),
    customerRefHash: cleanText(customerRefHash, 180),
    email: cleanEmail(email),
    startsAt: new Date(template.startsAt || Date.now()),
    expiresAt,
    privateNote: cleanText(override.privateNote || '', 500),
  });
  if (template.method === 'native_shopify_code') {
    try {
      const native = await createNativeShopifyDiscountCode({ shopDomain, template, code, expiresAt });
      issue.priceRuleId = native.priceRuleId;
      issue.discountCodeId = native.discountCodeId;
      issue.status = 'issued';
      issue.issuedAt = new Date();
      await issue.save();
    } catch (error) {
      issue.status = 'failed';
      issue.errorMessage = error.message || 'Could not issue Shopify discount code.';
      await issue.save();
      return issue;
    }
  }
  return issue;
}

function renderNames(shopDomain) {
  return [
    { area: 'Reviews', name: 'Customer Reviews Widget', appBlock: 'Customer Reviews / bulk_review_page', liquidRender: "{% render 'bulk_review_page' %}", selector: '[data-nectar-review-widget]', themeTarget: 'main-product.liquid or product template section' },
    { area: 'Reviews', name: 'Product Card Stars', appBlock: 'Product Card Stars', liquidRender: "{% render 'product_card_stars', product: product %}", selector: '[data-nectar-card-stars]', themeTarget: 'card-product.liquid / product-card snippet' },
    { area: 'Reviews', name: 'Star Badge', appBlock: 'Star Badge', liquidRender: "{% render 'star_badge', product: product %}", selector: '[data-nectar-star-badge]', themeTarget: 'collection cards, featured collection, product recommendations' },
    { area: 'Reviews', name: 'Global Review Carousel', appBlock: 'Review Carousel', liquidRender: "{% render 'carousel' %}", selector: '[data-nectar-review-carousel]', themeTarget: 'homepage, landing page, footer social-proof section' },
    { area: 'Cart Rewards', name: 'Cart Rewards Widget', appBlock: 'Cart Rewards Widget', liquidRender: "{% render 'cart-rewards-widget' %}", selector: '[data-nectar-cart-rewards]', themeTarget: 'cart drawer, cart page or mini-cart snippet' },
    { area: 'Loyalty', name: 'Checkout Loyalty Redemption', appBlock: 'Checkout UI extension', liquidRender: 'Checkout UI extension: checkout-loyalty-redemption', selector: 'checkout extension target', themeTarget: 'Shopify checkout extension, not theme Liquid' },
    { area: 'Discounts', name: 'Discount Engine', appBlock: 'No storefront block', liquidRender: 'Server-side module only: connect from Reviews/Loyalty/Cart Rewards', selector: 'no theme selector', themeTarget: 'Admin/API configuration only' },
  ].map((row) => ({ ...row, shopDomain }));
}

module.exports = {
  makeId,
  makeDiscountCode,
  defaultDiscountConfig,
  defaultDiscountTemplates,
  cleanTemplate,
  cleanDiscountConfig,
  getOrCreateDiscountProgram,
  issueDiscountCode,
  renderNames,
};
