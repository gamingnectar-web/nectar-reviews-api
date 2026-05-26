const { isDatabaseConnected } = require('../../../config/database');
const Campaign = require('../models/campaign.model');

const memoryCampaigns = [];

function normalize(shopDomain, input) {
  if (!input.name) {
    const error = new Error('Campaign name is required.');
    error.status = 400;
    throw error;
  }

  return {
    shopDomain,
    name: String(input.name).slice(0, 180),
    moduleKey: input.moduleKey || 'general',
    status: input.status || 'planned',
    objective: String(input.objective || '').slice(0, 500),
    startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
    endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
    metrics: input.metrics || { revenue: 0, orders: 0, participants: 0, rewardClaims: 0 },
    notes: String(input.notes || '').slice(0, 2000)
  };
}

async function createCampaign(shopDomain, input) {
  const campaign = normalize(shopDomain, input);
  if (!isDatabaseConnected()) {
    const record = { ...campaign, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: new Date(), updatedAt: new Date() };
    memoryCampaigns.unshift(record);
    return record;
  }
  return Campaign.create(campaign);
}

async function listCampaigns(shopDomain, filters = {}) {
  if (!isDatabaseConnected()) {
    return memoryCampaigns.filter((campaign) => campaign.shopDomain === shopDomain && (!filters.moduleKey || campaign.moduleKey === filters.moduleKey));
  }
  const query = { shopDomain };
  if (filters.moduleKey) query.moduleKey = filters.moduleKey;
  return Campaign.find(query).sort({ startsAt: 1, createdAt: -1 }).limit(250).lean();
}

async function updateCampaign(shopDomain, id, patch) {
  if (!isDatabaseConnected()) {
    const campaign = memoryCampaigns.find((item) => item.shopDomain === shopDomain && item.id === id);
    if (!campaign) return null;
    Object.assign(campaign, normalize(shopDomain, { ...campaign, ...patch }), { updatedAt: new Date() });
    return campaign;
  }
  return Campaign.findOneAndUpdate({ _id: id, shopDomain }, { $set: patch }, { new: true }).lean();
}

module.exports = { createCampaign, listCampaigns, updateCampaign };
