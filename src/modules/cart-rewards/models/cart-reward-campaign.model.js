const mongoose = require('mongoose');

const cartRewardCampaignSchema = new mongoose.Schema(
  {
    shopDomain: { type: String, required: true, index: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['draft', 'active', 'paused', 'ended'], default: 'draft', index: true },
    appearance: {
      drawerMode: { type: String, enum: ['inline', 'modal', 'slideout'], default: 'modal' },
      accentColor: { type: String, default: '#f5b301' },
      borderRadius: { type: Number, default: 18 },
      showProgressBar: { type: Boolean, default: true }
    },
    tiers: [
      {
        threshold: Number,
        rewardType: { type: String, enum: ['free_gift', 'discount', 'free_shipping'], default: 'free_gift' },
        productId: String,
        variantId: String,
        title: String,
        description: String
      }
    ],
    startsAt: Date,
    endsAt: Date,
    analytics: {
      impressions: { type: Number, default: 0 },
      claims: { type: Number, default: 0 },
      revenueAttributed: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.models.CartRewardCampaign || mongoose.model('CartRewardCampaign', cartRewardCampaignSchema);
