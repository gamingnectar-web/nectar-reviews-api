const { isDatabaseConnected } = require('../../../config/database');
const CartRewardCampaign = require('../models/cart-reward-campaign.model');

const memoryCampaigns = [];

function normalizeCampaign(shopDomain, input) {
  if (!input.name) {
    const error = new Error('Campaign name is required.');
    error.status = 400;
    throw error;
  }

  return {
    shopDomain,
    name: String(input.name).slice(0, 180),
    status: input.status || 'draft',
    appearance: {
      drawerMode: input.drawerMode || input.appearance?.drawerMode || 'modal',
      accentColor: input.accentColor || input.appearance?.accentColor || '#f5b301',
      borderRadius: Number(input.borderRadius || input.appearance?.borderRadius || 18),
      showProgressBar: input.showProgressBar !== undefined ? Boolean(input.showProgressBar) : input.appearance?.showProgressBar !== false
    },
    tiers: Array.isArray(input.tiers) ? input.tiers : [],
    startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
    endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
    analytics: input.analytics || { impressions: 0, claims: 0, revenueAttributed: 0 }
  };
}

async function createCampaign(shopDomain, input) {
  const campaign = normalizeCampaign(shopDomain, input);
  if (!isDatabaseConnected()) {
    const record = { ...campaign, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: new Date(), updatedAt: new Date() };
    memoryCampaigns.unshift(record);
    return record;
  }
  return CartRewardCampaign.create(campaign);
}

async function listCampaigns(shopDomain, filters = {}) {
  if (!isDatabaseConnected()) {
    return memoryCampaigns.filter((campaign) => campaign.shopDomain === shopDomain && (!filters.status || campaign.status === filters.status));
  }
  const query = { shopDomain };
  if (filters.status) query.status = filters.status;
  return CartRewardCampaign.find(query).sort({ startsAt: 1, createdAt: -1 }).limit(250).lean();
}

async function updateCampaign(shopDomain, id, patch) {
  if (!isDatabaseConnected()) {
    const campaign = memoryCampaigns.find((item) => item.shopDomain === shopDomain && item.id === id);
    if (!campaign) return null;
    Object.assign(campaign, normalizeCampaign(shopDomain, { ...campaign, ...patch }), { updatedAt: new Date() });
    return campaign;
  }
  return CartRewardCampaign.findOneAndUpdate({ _id: id, shopDomain }, { $set: patch }, { new: true }).lean();
}

async function activeForCart(shopDomain) {
  const now = new Date();
  const campaigns = await listCampaigns(shopDomain, { status: 'active' });
  return campaigns.filter((campaign) => {
    const starts = campaign.startsAt ? new Date(campaign.startsAt) <= now : true;
    const ends = campaign.endsAt ? new Date(campaign.endsAt) >= now : true;
    return starts && ends;
  });
}

module.exports = { createCampaign, listCampaigns, updateCampaign, activeForCart };
