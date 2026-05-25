const CartRewardCampaign = require("../models/CartRewardCampaign");
const CartRewardTier = require("../models/CartRewardTier");
const CartRewardDesign = require("../models/CartRewardDesign");
const CartRewardEvent = require("../models/CartRewardEvent");
const CartRewardTemplate = require("../models/CartRewardTemplate");
const { evaluateCartRewards } = require("../services/cartRewardEngine");
const { issueClaim, confirmClaimAdded, markClaimRemoved } = require("../services/cartRewardClaims");
const planner = require("../services/cartRewardPlanner");
const templates = require("../services/cartRewardTemplates");
const { searchRewardProducts } = require("../services/shopifyProductPicker");

function currentUser() {
  // Cart Rewards intentionally stores no customer profile information.
  // Keep audit metadata generic unless the host app injects its own non-customer admin label elsewhere.
  return "admin";
}

async function listCampaigns(req, res) {
  const campaigns = await CartRewardCampaign.find({
    shopDomain: req.shopDomain,
    status: { $ne: "archived" }
  }).sort({ status: 1, priority: 1, updatedAt: -1 });

  res.json({ campaigns });
}

async function getCampaign(req, res) {
  const campaign = await CartRewardCampaign.findOne({
    _id: req.params.id,
    shopDomain: req.shopDomain
  });

  if (!campaign) return res.status(404).json({ error: "Campaign not found." });

  const [tiers, design] = await Promise.all([
    CartRewardTier.find({ shopDomain: req.shopDomain, campaignId: campaign._id }).sort({ thresholdValue: 1 }),
    campaign.designId ? CartRewardDesign.findOne({ _id: campaign.designId, shopDomain: req.shopDomain }) : null
  ]);

  res.json({ campaign, tiers, design });
}

async function createCampaign(req, res) {
  const campaign = await CartRewardCampaign.create({
    shopDomain: req.shopDomain,
    ...req.body,
    createdBy: currentUser(req),
    updatedBy: currentUser(req)
  });

  res.status(201).json({ campaign });
}

async function updateCampaign(req, res) {
  const campaign = await CartRewardCampaign.findOneAndUpdate(
    { _id: req.params.id, shopDomain: req.shopDomain },
    {
      ...req.body,
      updatedBy: currentUser(req)
    },
    { new: true }
  );

  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  res.json({ campaign });
}

async function archiveCampaign(req, res) {
  const campaign = await CartRewardCampaign.findOneAndUpdate(
    { _id: req.params.id, shopDomain: req.shopDomain },
    { status: "archived", updatedBy: currentUser(req) },
    { new: true }
  );

  if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  res.json({ campaign });
}

async function upsertTier(req, res) {
  const payload = {
    shopDomain: req.shopDomain,
    ...req.body
  };

  let tier;

  if (req.params.tierId) {
    tier = await CartRewardTier.findOneAndUpdate(
      { _id: req.params.tierId, shopDomain: req.shopDomain },
      payload,
      { new: true }
    );
  } else {
    tier = await CartRewardTier.create(payload);
  }

  await CartRewardCampaign.findOneAndUpdate(
    { _id: tier.campaignId, shopDomain: req.shopDomain },
    {
      $set: {
        "launchChecklist.hasTiers": true,
        "launchChecklist.hasRewards": Array.isArray(tier.rewards) && tier.rewards.length > 0
      }
    }
  );

  res.json({ tier });
}

async function deleteTier(req, res) {
  await CartRewardTier.deleteOne({ _id: req.params.tierId, shopDomain: req.shopDomain });
  res.json({ ok: true });
}

async function upsertDesign(req, res) {
  const payload = {
    shopDomain: req.shopDomain,
    ...req.body
  };

  let design;

  if (req.params.designId) {
    design = await CartRewardDesign.findOneAndUpdate(
      { _id: req.params.designId, shopDomain: req.shopDomain },
      payload,
      { new: true, upsert: true }
    );
  } else {
    design = await CartRewardDesign.create(payload);
  }

  if (req.body.campaignId) {
    await CartRewardCampaign.findOneAndUpdate(
      { _id: req.body.campaignId, shopDomain: req.shopDomain },
      {
        designId: design._id,
        "launchChecklist.hasDesign": true
      }
    );
  }

  res.json({ design });
}

async function storefrontConfig(req, res) {
  const activeCampaigns = await CartRewardCampaign.find({
    shopDomain: req.shopDomain,
    status: "active"
  }).sort({ priority: 1 }).limit(5);

  const designId = activeCampaigns.find((campaign) => campaign.designId)?.designId;
  const design = designId
    ? await CartRewardDesign.findOne({ _id: designId, shopDomain: req.shopDomain })
    : await CartRewardDesign.findOne({ shopDomain: req.shopDomain }).sort({ createdAt: 1 });

  res.json({
    shopDomain: req.shopDomain,
    enabled: activeCampaigns.length > 0,
    appUrl: process.env.NECTAR_PUBLIC_APP_URL || "",
    design: design || {},
    campaigns: activeCampaigns.map((campaign) => ({
      id: String(campaign._id),
      name: campaign.name,
      publicTitle: campaign.publicTitle,
      rewardMode: campaign.rewardMode
    }))
  });
}

async function evaluateStorefront(req, res) {
  const result = await evaluateCartRewards({
    shopDomain: req.shopDomain,
    cart: req.body.cart,
    market: req.body.market || {},
    recordEvents: true,
    adminGraphql: req.shopifyAdminGraphql
  });

  res.json(result);
}

async function claimReward(req, res) {
  const result = await issueClaim({
    shopDomain: req.shopDomain,
    cart: req.body.cart,
    market: req.body.market || {},
    tierId: req.body.tierId,
    rewardId: req.body.rewardId,
    rewardVariantId: req.body.rewardVariantId,
    adminGraphql: req.shopifyAdminGraphql
  });

  res.json({
    claimId: String(result.claim._id),
    token: result.token,
    cartLine: result.cartLine
  });
}

async function confirmClaim(req, res) {
  const claim = await confirmClaimAdded({
    shopDomain: req.shopDomain,
    claimToken: req.body.claimToken,
    lineKey: req.body.lineKey
  });

  res.json({ claim });
}

async function removeClaim(req, res) {
  const claim = await markClaimRemoved({
    shopDomain: req.shopDomain,
    claimToken: req.body.claimToken,
    lineKey: req.body.lineKey,
    reason: req.body.reason || "shopper_removed"
  });

  res.json({ claim });
}

async function calendar(req, res) {
  const events = await planner.listCalendarEvents({
    shopDomain: req.shopDomain,
    from: req.query.from,
    to: req.query.to,
    status: req.query.status
  });

  res.json({ events });
}

async function monthlyCalendar(req, res) {
  const events = await planner.getMonthlyPlanner({
    shopDomain: req.shopDomain,
    year: req.query.year,
    month: req.query.month,
    timezone: req.query.timezone
  });

  res.json({ events });
}

async function scheduleCampaign(req, res) {
  const result = await planner.scheduleCampaign({
    shopDomain: req.shopDomain,
    campaignId: req.params.id,
    ...req.body,
    updatedBy: currentUser(req)
  });

  res.json(result);
}

async function previewScheduleConflicts(req, res) {
  const conflicts = await planner.detectScheduleConflicts({
    shopDomain: req.shopDomain,
    ...req.body
  });

  res.json({ conflicts });
}

async function swapCampaigns(req, res) {
  const result = await planner.planCampaignSwap({
    shopDomain: req.shopDomain,
    ...req.body,
    updatedBy: currentUser(req)
  });

  res.json(result);
}

async function cloneForFuture(req, res) {
  const result = await planner.cloneCampaignForFuture({
    shopDomain: req.shopDomain,
    campaignId: req.params.id,
    ...req.body,
    updatedBy: currentUser(req)
  });

  res.status(201).json(result);
}

async function pauseCampaign(req, res) {
  const campaign = await planner.pauseCampaignNow({
    shopDomain: req.shopDomain,
    campaignId: req.params.id,
    updatedBy: currentUser(req)
  });

  res.json({ campaign });
}

async function listTemplates(req, res) {
  const list = await templates.listTemplates({
    shopDomain: req.shopDomain,
    category: req.query.category,
    includeSystem: req.query.includeSystem !== "false"
  });

  res.json({ templates: list });
}

async function createTemplate(req, res) {
  const template = await templates.createTemplateFromCampaign({
    shopDomain: req.shopDomain,
    ...req.body
  });

  res.status(201).json({ template });
}

async function createFromTemplate(req, res) {
  const result = await templates.createCampaignFromTemplate({
    shopDomain: req.shopDomain,
    ...req.body,
    createdBy: currentUser(req)
  });

  res.status(201).json(result);
}

async function productSearch(req, res) {
  const result = await searchRewardProducts({
    adminGraphql: req.shopifyAdminGraphql,
    query: req.query.q || "",
    first: Number(req.query.first || 20)
  });

  res.json(result);
}

async function analytics(req, res) {
  const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 86400 * 1000);

  const events = await CartRewardEvent.aggregate([
    {
      $match: {
        shopDomain: req.shopDomain,
        occurredAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: {
          campaignId: "$campaignId",
          eventType: "$eventType"
        },
        count: { $sum: 1 },
        value: { $sum: "$value" }
      }
    }
  ]);

  res.json({ since, events });
}

module.exports = {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  archiveCampaign,
  upsertTier,
  deleteTier,
  upsertDesign,
  storefrontConfig,
  evaluateStorefront,
  claimReward,
  confirmClaim,
  removeClaim,
  calendar,
  monthlyCalendar,
  scheduleCampaign,
  previewScheduleConflicts,
  swapCampaigns,
  cloneForFuture,
  pauseCampaign,
  listTemplates,
  createTemplate,
  createFromTemplate,
  productSearch,
  analytics
};
