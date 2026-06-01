const CartRewardCampaign = require("../models/CartRewardCampaign");
const CartRewardTier = require("../models/CartRewardTier");
const CartRewardEvent = require("../models/CartRewardEvent");
const { cartSubtotalMinorUnits, formatMoney } = require("../utils/money");
const { isWithinCampaignSchedule } = require("../utils/dateWindows");
const {
  fetchVariantAvailability,
  resolveRewardAvailability,
  variantNumericId
} = require("./shopifyInventory");

function getCartItems(cart) {
  if (!cart) return [];
  if (Array.isArray(cart.items)) return cart.items;
  if (Array.isArray(cart.lines)) return cart.lines;
  return [];
}

function getCartQuantity(cart) {
  return getCartItems(cart)
    .filter((item) => !isNectarRewardLine(item))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function getCartProductIds(cart) {
  return getCartItems(cart)
    .filter((item) => !isNectarRewardLine(item))
    .map((item) => String(item.product_id || item.productId || item.merchandise?.product?.id || ""))
    .filter(Boolean);
}

function getCartVariantIds(cart) {
  return getCartItems(cart)
    .map((item) => String(item.variant_id || item.variantId || item.merchandise?.id || ""))
    .filter(Boolean);
}

function getRewardLineProperties(line) {
  return line.properties || line.attributes || {};
}

function isNectarRewardLine(line) {
  const props = getRewardLineProperties(line);
  return props._nectar_reward === "true" || props._nectar_reward === true;
}

function getRewardLineVariantId(line) {
  return String(line.variant_id || line.variantId || line.merchandise?.id || line.id || "");
}

function resolveMetric(campaign, cart) {
  if (campaign.triggerType === "quantity") {
    return getCartQuantity(cart);
  }

  const cartWithoutRewardLines = {
    items: getCartItems(cart).filter((item) => !isNectarRewardLine(item))
  };

  return cartSubtotalMinorUnits(cartWithoutRewardLines);
}

function passesCampaignRules(campaign, context) {
  const rules = campaign.rules || {};
  const cart = context.cart || {};
  const cartProductIds = getCartProductIds(cart);

  if (Array.isArray(rules.includeProducts) && rules.includeProducts.length) {
    const hasRequiredProduct = rules.includeProducts.some((productId) => cartProductIds.includes(String(productId)));
    if (!hasRequiredProduct) return { passes: false, reason: "missing_required_product" };
  }

  if (Array.isArray(rules.excludeProducts) && rules.excludeProducts.length) {
    const hasExcludedProduct = rules.excludeProducts.some((productId) => cartProductIds.includes(String(productId)));
    if (hasExcludedProduct) return { passes: false, reason: "excluded_product_in_cart" };
  }

  return { passes: true };
}

function getClaimedRewardLines(cart) {
  return getCartItems(cart).filter(isNectarRewardLine).map((line) => {
    const props = getRewardLineProperties(line);
    return {
      line,
      campaignId: String(props._nectar_campaign_id || ""),
      tierId: String(props._nectar_tier_id || ""),
      rewardId: String(props._nectar_reward_id || ""),
      variantId: getRewardLineVariantId(line),
      quantity: Number(line.quantity || 1)
    };
  });
}

function pickVisibleRewards({ tier, campaign, inventoryByVariant }) {
  const visible = [];
  const backups = [];

  for (const reward of tier.rewards || []) {
    const live = inventoryByVariant.get(String(reward.variantId)) || inventoryByVariant.get(variantNumericId(reward.variantId));
    const availability = resolveRewardAvailability({ reward, live, campaign });
    if (availability.hidden) {
      continue;
    }

    const item = { reward, live, availability };
    if (reward.isBackup || availability.behaviour === "backup_only") backups.push(item);
    else visible.push(item);
  }

  if (!visible.length && campaign.inventory?.preferBackupRewards !== false) {
    return backups.filter((item) => !item.availability.hidden);
  }

  return visible;
}

function buildTierView({ tier, campaign, metric, currencyCode, claimedRewardLines, inventoryByVariant }) {
  const unlocked = metric >= Number(tier.thresholdValue || 0);
  const amountRemaining = Math.max(0, Number(tier.thresholdValue || 0) - metric);
  const visibleRewards = pickVisibleRewards({ tier, campaign, inventoryByVariant });

  const rewards = visibleRewards.map(({ reward, live, availability }) => {
    const rewardVariantId = String(reward.variantId);
    const numericRewardVariantId = variantNumericId(rewardVariantId);
    const claimedLine = claimedRewardLines.find((claimed) => {
      return claimed.rewardId === String(reward._id) ||
        claimed.variantId === rewardVariantId ||
        variantNumericId(claimed.variantId) === numericRewardVariantId;
    });

    const allowedQuantity = Number(reward.quantity || 1);
    const quantityExceeded = claimedLine && Number(claimedLine.quantity || 0) > allowedQuantity;

    return {
      id: String(reward._id),
      productId: reward.productId,
      variantId: reward.variantId,
      numericVariantId: numericRewardVariantId,
      handle: live?.handle || reward.handle,
      title: reward.title || live?.productTitle || live?.title,
      variantTitle: reward.variantTitle || live?.title,
      imageUrl: reward.imageUrl || live?.imageUrl,
      quantity: allowedQuantity,
      discountType: reward.discountType,
      discountValue: reward.discountValue,
      outOfStockBehaviour: reward.outOfStockBehaviour,
      inventoryPolicy: reward.inventoryPolicy,
      inventoryQuantity: availability.inventoryQuantity,
      inventorySource: availability.source,
      availableForSale: availability.available,
      soldOut: availability.soldOut,
      continuation: availability.continuation,
      isBackup: Boolean(reward.isBackup),
      isDefault: reward.isDefault,
      disabled: availability.disabled || quantityExceeded,
      invalidQuantity: Boolean(quantityExceeded),
      claimed: Boolean(claimedLine)
    };
  });

  return {
    id: String(tier._id),
    campaignId: String(campaign._id),
    title: tier.title,
    description: tier.description,
    thresholdType: tier.thresholdType,
    thresholdValue: tier.thresholdValue,
    thresholdFormatted: tier.thresholdType === "subtotal"
      ? formatMoney(tier.thresholdValue, currencyCode)
      : `${tier.thresholdValue} items`,
    currencyCode,
    sortOrder: tier.sortOrder,
    isStackable: tier.isStackable,
    maxClaimsPerCart: tier.maxClaimsPerCart,
    badgeText: tier.badgeText,
    lockedText: tier.lockedText,
    unlockedText: tier.unlockedText,
    status: unlocked ? "unlocked" : "locked",
    amountRemaining,
    amountRemainingFormatted: tier.thresholdType === "subtotal"
      ? formatMoney(amountRemaining, currencyCode)
      : `${amountRemaining} items`,
    rewards
  };
}

function applyRewardMode(campaign, tierViews) {
  const unlocked = tierViews.filter((tier) => tier.status === "unlocked");

  if (campaign.rewardMode === "highest_only") {
    const highest = unlocked.sort((a, b) => b.thresholdValue - a.thresholdValue)[0];
    return tierViews.map((tier) => ({
      ...tier,
      claimable: highest ? tier.id === highest.id : false,
      suppressedByMode: highest ? tier.id !== highest.id && tier.status === "unlocked" : false
    }));
  }

  if (campaign.rewardMode === "choose_one") {
    return tierViews.map((tier) => ({
      ...tier,
      claimable: tier.status === "unlocked",
      chooseOne: tier.status === "unlocked"
    }));
  }

  return tierViews.map((tier) => ({
    ...tier,
    claimable: tier.status === "unlocked"
  }));
}

async function getActiveCampaigns(shopDomain, now = new Date()) {
  const candidates = await CartRewardCampaign.find({
    shopDomain,
    status: { $in: ["active", "scheduled"] },
    $or: [
      { startsAt: { $exists: false } },
      { startsAt: null },
      { startsAt: { $lte: now } }
    ]
  }).sort({ priority: 1, createdAt: -1 });

  return candidates.filter((campaign) => {
    if (campaign.status !== "active") return false;
    return isWithinCampaignSchedule(campaign, now);
  });
}

async function evaluateCartRewards({
  shopDomain,
  cart,
  market = {},
  now = new Date(),
  recordEvents = false,
  adminGraphql = null
}) {
  const campaigns = await getActiveCampaigns(shopDomain, now);
  const claimedRewardLines = getClaimedRewardLines(cart);
  const evaluations = [];

  for (const campaign of campaigns) {
    const ruleResult = passesCampaignRules(campaign, { cart, market });
    if (!ruleResult.passes) {
      evaluations.push({
        campaignId: String(campaign._id),
        status: "not_eligible",
        reason: ruleResult.reason
      });
      continue;
    }

    const tiers = await CartRewardTier.find({
      shopDomain,
      campaignId: campaign._id,
      active: true
    }).sort({ thresholdValue: 1, sortOrder: 1 });

    const variantIds = tiers.flatMap((tier) => (tier.rewards || []).map((reward) => reward.variantId));
    const inventoryByVariant = await fetchVariantAvailability({ adminGraphql, variantIds });

    const metric = resolveMetric(campaign, cart);
    const currencyCode = market.currencyCode || cart?.currency || cart?.currencyCode || "GBP";
    const rawTierViews = tiers.map((tier) =>
      buildTierView({ tier, campaign, metric, currencyCode, claimedRewardLines, inventoryByVariant })
    );

    const tierViews = campaign.inventory?.hideEmptyTiers === false
      ? rawTierViews
      : rawTierViews.filter((tier) => (tier.rewards || []).length > 0);

    if (!tierViews.length && campaign.inventory?.hideEmptyCampaigns !== false) {
      evaluations.push({
        campaignId: String(campaign._id),
        status: "not_eligible",
        reason: "no_fulfillable_rewards"
      });
      continue;
    }

    const tiersWithMode = applyRewardMode(campaign, tierViews);
    const nextTier = tiersWithMode.find((tier) => tier.status === "locked");
    const unlockedCount = tiersWithMode.filter((tier) => tier.status === "unlocked").length;
    const fulfillableRewardCount = tiersWithMode.reduce((sum, tier) => sum + (tier.rewards || []).filter((reward) => !reward.disabled).length, 0);

    evaluations.push({
      campaignId: String(campaign._id),
      name: campaign.name,
      publicTitle: campaign.publicTitle,
      description: campaign.description,
      rewardMode: campaign.rewardMode,
      triggerType: campaign.triggerType,
      metric,
      currencyCode,
      status: fulfillableRewardCount ? "eligible" : "not_eligible",
      reason: fulfillableRewardCount ? undefined : "no_available_rewards",
      unlockedCount,
      nextTier,
      tiers: tiersWithMode
    });

    if (recordEvents && fulfillableRewardCount) {
      await CartRewardEvent.create({
        shopDomain,
        campaignId: campaign._id,
        eventType: "impression",
        value: metric,
        currencyCode,
        cartToken: cart?.token
      });
    }
  }

  return {
    shopDomain,
    generatedAt: new Date().toISOString(),
    cartToken: cart?.token,
    campaigns: evaluations
  };
}

function findTierAndReward(evaluation, tierId, rewardIdOrVariantId) {
  for (const campaign of evaluation.campaigns || []) {
    if (campaign.status !== "eligible") continue;
    for (const tier of campaign.tiers || []) {
      if (String(tier.id) !== String(tierId)) continue;
      const reward = (tier.rewards || []).find((item) => {
        return String(item.id) === String(rewardIdOrVariantId) ||
          String(item.variantId) === String(rewardIdOrVariantId) ||
          String(item.numericVariantId) === String(rewardIdOrVariantId);
      });

      if (reward) return { campaign, tier, reward };
    }
  }

  return null;
}

module.exports = {
  evaluateCartRewards,
  getActiveCampaigns,
  passesCampaignRules,
  isNectarRewardLine,
  findTierAndReward,
  getCartItems,
  getCartVariantIds,
  getClaimedRewardLines,
  variantNumericId
};
