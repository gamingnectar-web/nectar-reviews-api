const CartRewardCampaign = require("../models/CartRewardCampaign");
const CartRewardTier = require("../models/CartRewardTier");
const CartRewardDesign = require("../models/CartRewardDesign");
const CartRewardEvent = require("../models/CartRewardEvent");
const CartRewardClaim = require("../models/CartRewardClaim");
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


function compactCampaignPayload(body = {}) {
  const allowed = [
    "name",
    "publicTitle",
    "description",
    "status",
    "triggerType",
    "rewardMode",
    "priority",
    "startsAt",
    "endsAt",
    "timezone",
    "activeWindows",
    "blackoutDates",
    "autoActivate",
    "autoExpire",
    "swapGroup",
    "rules",
    "inventory"
  ];

  return allowed.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) acc[key] = body[key];
    return acc;
  }, {});
}

function maskToken(value) {
  const raw = String(value || "");
  if (!raw) return "anonymous cart";
  if (raw.length <= 8) return `${raw.slice(0, 2)}…${raw.slice(-2)}`;
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
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


async function saveCampaignBundle(req, res) {
  const campaignPayload = {
    ...compactCampaignPayload(req.body),
    shopDomain: req.shopDomain,
    updatedBy: currentUser(req)
  };

  if (!campaignPayload.name) campaignPayload.name = "Cart milestone rewards";
  if (!campaignPayload.publicTitle) campaignPayload.publicTitle = "Unlock free rewards";

  let campaign;
  if (req.params.id) {
    campaign = await CartRewardCampaign.findOneAndUpdate(
      { _id: req.params.id, shopDomain: req.shopDomain },
      campaignPayload,
      { new: true }
    );
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
  } else {
    campaign = await CartRewardCampaign.create({
      ...campaignPayload,
      createdBy: currentUser(req)
    });
  }

  let design = null;
  if (req.body.design && typeof req.body.design === "object") {
    design = await CartRewardDesign.findOneAndUpdate(
      { shopDomain: req.shopDomain, campaignId: campaign._id },
      {
        ...req.body.design,
        shopDomain: req.shopDomain,
        campaignId: campaign._id
      },
      { new: true, upsert: true }
    );

    campaign.designId = design._id;
    campaign.launchChecklist.hasDesign = true;
    await campaign.save();
  }

  const tierResults = [];
  if (Array.isArray(req.body.tiers)) {
    for (const [index, tier] of req.body.tiers.entries()) {
      const payload = {
        ...tier,
        shopDomain: req.shopDomain,
        campaignId: campaign._id,
        sortOrder: Number(tier.sortOrder || index + 1),
        thresholdValue: Number(tier.thresholdValue || 0),
        rewards: Array.isArray(tier.rewards) ? tier.rewards : []
      };

      let saved;
      if (tier._id || tier.id) {
        saved = await CartRewardTier.findOneAndUpdate(
          { _id: tier._id || tier.id, shopDomain: req.shopDomain, campaignId: campaign._id },
          payload,
          { new: true }
        );
      }

      if (!saved) saved = await CartRewardTier.create(payload);
      tierResults.push(saved);
    }

    const hasRewards = tierResults.some((tier) => Array.isArray(tier.rewards) && tier.rewards.length > 0);
    await CartRewardCampaign.findOneAndUpdate(
      { _id: campaign._id, shopDomain: req.shopDomain },
      {
        "launchChecklist.hasTiers": tierResults.length > 0,
        "launchChecklist.hasRewards": hasRewards,
        "launchChecklist.hasSchedule": Boolean(campaign.startsAt || campaign.endsAt)
      }
    );
  }

  const freshCampaign = await CartRewardCampaign.findOne({ _id: campaign._id, shopDomain: req.shopDomain });
  res.status(req.params.id ? 200 : 201).json({ campaign: freshCampaign || campaign, tiers: tierResults, design });
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


async function analyticsOverview(req, res) {
  const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 86400 * 1000);

  const [events, campaigns, topRewards, recentClaims] = await Promise.all([
    CartRewardEvent.aggregate([
      {
        $match: {
          shopDomain: req.shopDomain,
          occurredAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: "$eventType",
          count: { $sum: 1 },
          value: { $sum: "$value" }
        }
      }
    ]),
    CartRewardCampaign.find({ shopDomain: req.shopDomain, status: { $ne: "archived" } })
      .select("name status rewardMode analytics startsAt endsAt")
      .sort({ updatedAt: -1 })
      .limit(50),
    CartRewardClaim.aggregate([
      {
        $match: {
          shopDomain: req.shopDomain,
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: "$rewardVariantId",
          claims: { $sum: 1 },
          conversions: { $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] } },
          lastStatus: { $last: "$status" }
        }
      },
      { $sort: { claims: -1 } },
      { $limit: 10 }
    ]),
    CartRewardClaim.find({ shopDomain: req.shopDomain, createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(12)
      .select("campaignId tierId rewardVariantId status cartToken orderName createdAt convertedAt")
  ]);

  const byType = events.reduce((acc, event) => {
    acc[event._id] = {
      count: Number(event.count || 0),
      value: Number(event.value || 0)
    };
    return acc;
  }, {});

  const summary = {
    impressions: byType.impression?.count || 0,
    unlocks: byType.unlock?.count || 0,
    claims: (byType.claim_added_to_cart?.count || 0) + (byType.claim_issued?.count || 0),
    removals: byType.claim_removed?.count || 0,
    conversions: byType.conversion?.count || 0,
    influencedRevenue: byType.conversion?.value || 0
  };

  res.json({
    since,
    summary,
    campaigns: campaigns.map((campaign) => ({
      id: String(campaign._id),
      name: campaign.name,
      status: campaign.status,
      rewardMode: campaign.rewardMode,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      analytics: campaign.analytics || {}
    })),
    topRewards: topRewards.map((item) => ({
      rewardVariantId: item._id,
      rewardTitle: item._id,
      claims: item.claims,
      conversions: item.conversions,
      lastStatus: item.lastStatus
    })),
    recentClaims: recentClaims.map((claim) => ({
      id: String(claim._id),
      campaignId: claim.campaignId ? String(claim.campaignId) : null,
      tierId: claim.tierId ? String(claim.tierId) : null,
      rewardVariantId: claim.rewardVariantId,
      status: claim.status,
      orderName: claim.orderName || null,
      cartRef: maskToken(claim.cartToken),
      createdAt: claim.createdAt,
      convertedAt: claim.convertedAt
    }))
  });
}

module.exports = {
  listCampaigns,
  getCampaign,
  createCampaign,
  saveCampaignBundle,
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
  analytics,
  analyticsOverview
};
