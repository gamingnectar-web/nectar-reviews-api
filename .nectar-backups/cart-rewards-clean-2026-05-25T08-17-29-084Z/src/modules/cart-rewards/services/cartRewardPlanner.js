const CartRewardCampaign = require("../models/CartRewardCampaign");
const CartRewardTier = require("../models/CartRewardTier");
const CartRewardEvent = require("../models/CartRewardEvent");
const { overlaps, getMonthRange, toDateTime } = require("../utils/dateWindows");

function asDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function listCalendarEvents({ shopDomain, from, to, status }) {
  const query = {
    shopDomain,
    status: status ? status : { $ne: "archived" }
  };

  if (from || to) {
    query.$or = [
      {
        startsAt: {
          ...(to ? { $lte: asDateOrNull(to) } : {})
        },
        endsAt: {
          ...(from ? { $gte: asDateOrNull(from) } : {})
        }
      },
      {
        startsAt: {
          ...(from ? { $gte: asDateOrNull(from) } : {}),
          ...(to ? { $lte: asDateOrNull(to) } : {})
        }
      }
    ];
  }

  const campaigns = await CartRewardCampaign.find(query).sort({ startsAt: 1, priority: 1 });

  return campaigns.map((campaign) => ({
    id: String(campaign._id),
    title: campaign.name,
    publicTitle: campaign.publicTitle,
    status: campaign.status,
    rewardMode: campaign.rewardMode,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    timezone: campaign.timezone,
    swapGroup: campaign.swapGroup,
    priority: campaign.priority,
    autoActivate: campaign.autoActivate,
    autoExpire: campaign.autoExpire
  }));
}

async function getMonthlyPlanner({ shopDomain, year, month, timezone = "Europe/London" }) {
  const range = getMonthRange(Number(year), Number(month), timezone);
  return listCalendarEvents({
    shopDomain,
    from: range.start,
    to: range.end
  });
}

async function detectScheduleConflicts({ shopDomain, campaignId, startsAt, endsAt, swapGroup }) {
  const draftCampaign = {
    startsAt: asDateOrNull(startsAt),
    endsAt: asDateOrNull(endsAt),
    timezone: "Europe/London"
  };

  const query = {
    shopDomain,
    status: { $in: ["scheduled", "active"] }
  };

  if (campaignId) {
    query._id = { $ne: campaignId };
  }

  if (swapGroup) {
    query.swapGroup = swapGroup;
  }

  const campaigns = await CartRewardCampaign.find(query);

  return campaigns
    .filter((campaign) => overlaps(draftCampaign, campaign))
    .map((campaign) => ({
      campaignId: String(campaign._id),
      name: campaign.name,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      status: campaign.status,
      swapGroup: campaign.swapGroup
    }));
}

async function scheduleCampaign({
  shopDomain,
  campaignId,
  startsAt,
  endsAt,
  timezone = "Europe/London",
  autoActivate = true,
  autoExpire = true,
  activeWindows = [],
  blackoutDates = [],
  swapGroup,
  updatedBy
}) {
  const startDate = asDateOrNull(startsAt);
  const endDate = asDateOrNull(endsAt);

  if (!startDate || !endDate) {
    throw new Error("startsAt and endsAt are required.");
  }

  if (endDate <= startDate) {
    throw new Error("endsAt must be after startsAt.");
  }

  const campaign = await CartRewardCampaign.findOne({ _id: campaignId, shopDomain });
  if (!campaign) throw new Error("Campaign not found.");

  const conflicts = await detectScheduleConflicts({
    shopDomain,
    campaignId,
    startsAt: startDate,
    endsAt: endDate,
    swapGroup: swapGroup || campaign.swapGroup
  });

  campaign.startsAt = startDate;
  campaign.endsAt = endDate;
  campaign.timezone = timezone;
  campaign.autoActivate = autoActivate;
  campaign.autoExpire = autoExpire;
  campaign.activeWindows = activeWindows;
  campaign.blackoutDates = blackoutDates;
  campaign.swapGroup = swapGroup || campaign.swapGroup;
  campaign.status = startDate <= new Date() && autoActivate ? "active" : "scheduled";
  campaign.updatedBy = updatedBy;
  campaign.launchChecklist = {
    ...(campaign.launchChecklist || {}),
    hasSchedule: true
  };

  await campaign.save();

  await CartRewardEvent.create({
    shopDomain,
    campaignId: campaign._id,
    eventType: "campaign_scheduled",
    properties: {
      startsAt: startDate,
      endsAt: endDate,
      timezone,
      conflictCount: conflicts.length
    }
  });

  return { campaign, conflicts };
}

async function planCampaignSwap({
  shopDomain,
  fromCampaignId,
  toCampaignId,
  swapAt,
  timezone = "Europe/London",
  updatedBy
}) {
  const swapDate = asDateOrNull(swapAt);
  if (!swapDate) throw new Error("swapAt is required.");

  const [fromCampaign, toCampaign] = await Promise.all([
    CartRewardCampaign.findOne({ _id: fromCampaignId, shopDomain }),
    CartRewardCampaign.findOne({ _id: toCampaignId, shopDomain })
  ]);

  if (!fromCampaign || !toCampaign) {
    throw new Error("Both campaigns are required for a planned swap.");
  }

  const group = fromCampaign.swapGroup || toCampaign.swapGroup || `swap_${Date.now()}`;

  fromCampaign.swapGroup = group;
  fromCampaign.endsAt = swapDate;
  fromCampaign.nextCampaignId = toCampaign._id;
  fromCampaign.autoExpire = true;
  fromCampaign.updatedBy = updatedBy;

  toCampaign.swapGroup = group;
  toCampaign.startsAt = swapDate;
  toCampaign.status = "scheduled";
  toCampaign.autoActivate = true;
  toCampaign.updatedBy = updatedBy;

  await Promise.all([fromCampaign.save(), toCampaign.save()]);

  await CartRewardEvent.create({
    shopDomain,
    campaignId: fromCampaign._id,
    eventType: "campaign_swapped",
    properties: {
      fromCampaignId,
      toCampaignId,
      swapAt: swapDate,
      timezone
    }
  });

  return {
    fromCampaign,
    toCampaign,
    swapAt: swapDate,
    swapGroup: group
  };
}

async function activateDueCampaigns(now = new Date()) {
  const campaigns = await CartRewardCampaign.find({
    status: "scheduled",
    autoActivate: true,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gte: now } }]
  });

  const activated = [];

  for (const campaign of campaigns) {
    campaign.status = "active";
    await campaign.save();

    await CartRewardEvent.create({
      shopDomain: campaign.shopDomain,
      campaignId: campaign._id,
      eventType: "campaign_activated",
      properties: { activatedAt: now }
    });

    activated.push(campaign);
  }

  return activated;
}

async function expireDueCampaigns(now = new Date()) {
  const campaigns = await CartRewardCampaign.find({
    status: { $in: ["active", "scheduled"] },
    autoExpire: true,
    endsAt: { $lte: now }
  });

  const expired = [];

  for (const campaign of campaigns) {
    campaign.status = "expired";
    await campaign.save();

    await CartRewardEvent.create({
      shopDomain: campaign.shopDomain,
      campaignId: campaign._id,
      eventType: "campaign_expired",
      properties: { expiredAt: now }
    });

    expired.push(campaign);
  }

  return expired;
}

async function pauseCampaignNow({ shopDomain, campaignId, updatedBy }) {
  const campaign = await CartRewardCampaign.findOne({ _id: campaignId, shopDomain });
  if (!campaign) throw new Error("Campaign not found.");

  campaign.status = "paused";
  campaign.updatedBy = updatedBy;
  await campaign.save();

  await CartRewardEvent.create({
    shopDomain,
    campaignId,
    eventType: "campaign_paused",
    properties: { pausedAt: new Date() }
  });

  return campaign;
}

async function cloneCampaignForFuture({
  shopDomain,
  campaignId,
  name,
  startsAt,
  endsAt,
  updatedBy
}) {
  const campaign = await CartRewardCampaign.findOne({ _id: campaignId, shopDomain }).lean();
  if (!campaign) throw new Error("Campaign not found.");

  const tiers = await CartRewardTier.find({ shopDomain, campaignId }).lean();

  delete campaign._id;
  delete campaign.createdAt;
  delete campaign.updatedAt;
  campaign.name = name || `${campaign.name} copy`;
  campaign.status = "scheduled";
  campaign.startsAt = asDateOrNull(startsAt);
  campaign.endsAt = asDateOrNull(endsAt);
  campaign.createdBy = updatedBy;
  campaign.updatedBy = updatedBy;

  const newCampaign = await CartRewardCampaign.create(campaign);

  const newTiers = await CartRewardTier.insertMany(
    tiers.map((tier) => {
      delete tier._id;
      delete tier.createdAt;
      delete tier.updatedAt;
      return {
        ...tier,
        campaignId: newCampaign._id
      };
    })
  );

  return { campaign: newCampaign, tiers: newTiers };
}

module.exports = {
  listCalendarEvents,
  getMonthlyPlanner,
  detectScheduleConflicts,
  scheduleCampaign,
  planCampaignSwap,
  activateDueCampaigns,
  expireDueCampaigns,
  pauseCampaignNow,
  cloneCampaignForFuture
};
