const CartRewardClaim = require("../models/CartRewardClaim");
const CartRewardEvent = require("../models/CartRewardEvent");
const {
  evaluateCartRewards,
  findTierAndReward,
  getClaimedRewardLines,
  variantNumericId
} = require("./cartRewardEngine");
const { createClaimToken, verifyToken, hashToken } = require("./cartRewardTokens");

function campaignAlreadyHasClaim(cart, campaignId) {
  return getClaimedRewardLines(cart).some((line) => line.campaignId === String(campaignId));
}

function tierClaimCount(cart, tierId) {
  return getClaimedRewardLines(cart).filter((line) => line.tierId === String(tierId)).length;
}

async function issueClaim({
  shopDomain,
  cart,
  market = {},
  tierId,
  rewardId,
  rewardVariantId,
  adminGraphql = null
}) {
  const evaluation = await evaluateCartRewards({
    shopDomain,
    cart,
    market,
    recordEvents: false,
    adminGraphql
  });

  const match = findTierAndReward(evaluation, tierId, rewardId || rewardVariantId);
  if (!match) {
    throw new Error("Reward is not eligible for this cart.");
  }

  if (match.tier.status !== "unlocked" || !match.tier.claimable) {
    throw new Error("This reward tier is not claimable yet.");
  }

  if (match.reward.claimed) {
    throw new Error("This reward has already been added to the cart.");
  }

  if (match.reward.disabled) {
    throw new Error("This reward is currently unavailable.");
  }

  if (match.campaign.rewardMode === "choose_one" && campaignAlreadyHasClaim(cart, match.campaign.campaignId)) {
    throw new Error("Only one reward can be selected for this campaign.");
  }

  if (match.tier.maxClaimsPerCart && tierClaimCount(cart, match.tier.id) >= Number(match.tier.maxClaimsPerCart)) {
    throw new Error("This tier has already reached its per-cart claim limit.");
  }

  const { token, payload } = createClaimToken({
    shopDomain,
    campaignId: match.campaign.campaignId,
    tierId: match.tier.id,
    rewardId: match.reward.id,
    rewardVariantId: match.reward.variantId,
    cartToken: cart?.token,
    cartSubtotal: match.campaign.metric,
    currencyCode: match.campaign.currencyCode,
    quantity: match.reward.quantity
  });

  const claim = await CartRewardClaim.create({
    shopDomain,
    campaignId: match.campaign.campaignId,
    tierId: match.tier.id,
    rewardId: match.reward.id,
    rewardVariantId: match.reward.variantId,
    cartToken: cart?.token,
    claimTokenHash: hashToken(token),
    status: "issued",
    cartSubtotalAtClaim: match.campaign.metric,
    currencyCode: match.campaign.currencyCode,
    quantity: match.reward.quantity,
    expiresAt: new Date(payload.expiresAt),
    metadata: {
      rewardTitle: match.reward.title,
      tierTitle: match.tier.title,
      inventorySource: match.reward.inventorySource,
      continuation: Boolean(match.reward.continuation)
    }
  });

  await CartRewardEvent.create({
    shopDomain,
    campaignId: match.campaign.campaignId,
    tierId: match.tier.id,
    rewardVariantId: match.reward.variantId,
    cartToken: cart?.token,
    eventType: "claim_issued",
    value: match.campaign.metric,
    currencyCode: match.campaign.currencyCode
  });

  return {
    claim,
    token,
    cartLine: {
      id: Number(variantNumericId(match.reward.variantId)) || match.reward.variantId,
      merchandiseId: match.reward.variantId,
      quantity: match.reward.quantity || 1,
      properties: {
        _nectar_reward: "true",
        _nectar_campaign_id: String(match.campaign.campaignId),
        _nectar_tier_id: String(match.tier.id),
        _nectar_reward_id: String(match.reward.id),
        _nectar_claim_token: token,
        _nectar_reward_mode: match.campaign.rewardMode,
        _nectar_reward_qty: String(match.reward.quantity || 1)
      },
      attributes: [
        { key: "_nectar_reward", value: "true" },
        { key: "_nectar_campaign_id", value: String(match.campaign.campaignId) },
        { key: "_nectar_tier_id", value: String(match.tier.id) },
        { key: "_nectar_reward_id", value: String(match.reward.id) },
        { key: "_nectar_claim_token", value: token },
        { key: "_nectar_reward_mode", value: match.campaign.rewardMode },
        { key: "_nectar_reward_qty", value: String(match.reward.quantity || 1) }
      ]
    }
  };
}

async function confirmClaimAdded({
  shopDomain,
  claimToken,
  lineKey
}) {
  const verified = verifyToken(claimToken);
  if (!verified.valid) {
    throw new Error(`Invalid claim token: ${verified.reason}`);
  }

  const claim = await CartRewardClaim.findOne({
    shopDomain,
    claimTokenHash: hashToken(claimToken),
    status: { $in: ["issued", "claimed"] }
  });

  if (!claim) throw new Error("Claim not found.");

  claim.status = "claimed";
  claim.lineKey = lineKey;
  await claim.save();

  await CartRewardEvent.create({
    shopDomain,
    campaignId: claim.campaignId,
    tierId: claim.tierId,
    rewardVariantId: claim.rewardVariantId,
    cartToken: claim.cartToken,
    eventType: "claim_added_to_cart"
  });

  return claim;
}

async function markClaimRemoved({
  shopDomain,
  claimToken,
  lineKey,
  reason = "removed"
}) {
  const claim = claimToken
    ? await CartRewardClaim.findOne({ shopDomain, claimTokenHash: hashToken(claimToken) })
    : await CartRewardClaim.findOne({ shopDomain, lineKey });

  if (!claim) return null;

  claim.status = "removed";
  claim.metadata = {
    ...(claim.metadata || {}),
    removalReason: reason
  };
  await claim.save();

  await CartRewardEvent.create({
    shopDomain,
    campaignId: claim.campaignId,
    tierId: claim.tierId,
    rewardVariantId: claim.rewardVariantId,
    cartToken: claim.cartToken,
    eventType: "claim_removed",
    properties: { reason, lineKey }
  });

  return claim;
}

async function expireOldClaims(now = new Date()) {
  return CartRewardClaim.updateMany(
    {
      status: { $in: ["issued"] },
      expiresAt: { $lte: now }
    },
    {
      $set: { status: "expired" }
    }
  );
}

module.exports = {
  issueClaim,
  confirmClaimAdded,
  markClaimRemoved,
  expireOldClaims
};
