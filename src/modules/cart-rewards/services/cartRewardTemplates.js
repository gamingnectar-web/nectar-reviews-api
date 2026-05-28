const CartRewardCampaign = require("../models/CartRewardCampaign");
const CartRewardTier = require("../models/CartRewardTier");
const CartRewardDesign = require("../models/CartRewardDesign");
const CartRewardTemplate = require("../models/CartRewardTemplate");

function stripMongoFields(doc) {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete plain._id;
  delete plain.createdAt;
  delete plain.updatedAt;
  delete plain.__v;
  return plain;
}

async function listTemplates({ shopDomain, category, includeSystem = true }) {
  const query = {
    $or: [{ shopDomain }, ...(includeSystem ? [{ isSystemTemplate: true }] : [])]
  };

  if (category) query.category = category;

  return CartRewardTemplate.find(query).sort({ isSystemTemplate: -1, usageCount: -1, name: 1 });
}

async function createTemplateFromCampaign({
  shopDomain,
  campaignId,
  name,
  category = "custom",
  description,
  tags = []
}) {
  const campaign = await CartRewardCampaign.findOne({ _id: campaignId, shopDomain });
  if (!campaign) throw new Error("Campaign not found.");

  const [tiers, design] = await Promise.all([
    CartRewardTier.find({ shopDomain, campaignId }).sort({ thresholdValue: 1 }),
    campaign.designId ? CartRewardDesign.findOne({ _id: campaign.designId, shopDomain }) : null
  ]);

  const snapshot = stripMongoFields(campaign);
  snapshot.status = "draft";
  snapshot.startsAt = null;
  snapshot.endsAt = null;
  snapshot.analytics = undefined;

  return CartRewardTemplate.create({
    shopDomain,
    name,
    category,
    description,
    tags,
    campaignSnapshot: snapshot,
    tierSnapshots: tiers.map(stripMongoFields),
    designSnapshot: design ? stripMongoFields(design) : {},
    isSystemTemplate: false
  });
}

async function createCampaignFromTemplate({
  shopDomain,
  templateId,
  name,
  startsAt,
  endsAt,
  createdBy
}) {
  const template = await CartRewardTemplate.findOne({
    _id: templateId,
    $or: [{ shopDomain }, { isSystemTemplate: true }]
  });

  if (!template) throw new Error("Template not found.");

  const campaignSnapshot = {
    ...template.campaignSnapshot,
    shopDomain,
    name: name || template.campaignSnapshot.name || template.name,
    status: startsAt ? "scheduled" : "draft",
    startsAt: startsAt ? new Date(startsAt) : null,
    endsAt: endsAt ? new Date(endsAt) : null,
    createdBy,
    updatedBy: createdBy
  };

  const designSnapshot = template.designSnapshot || {};
  let design = null;

  if (Object.keys(designSnapshot).length) {
    design = await CartRewardDesign.create({
      ...designSnapshot,
      shopDomain,
      name: `${campaignSnapshot.name} design`
    });
    campaignSnapshot.designId = design._id;
  }

  const campaign = await CartRewardCampaign.create(campaignSnapshot);

  const tiers = await CartRewardTier.insertMany(
    (template.tierSnapshots || []).map((tier) => ({
      ...tier,
      shopDomain,
      campaignId: campaign._id
    }))
  );

  template.usageCount += 1;
  template.lastUsedAt = new Date();
  await template.save();

  return { campaign, tiers, design };
}

module.exports = {
  listTemplates,
  createTemplateFromCampaign,
  createCampaignFromTemplate
};
