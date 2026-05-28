const mongoose = require("mongoose");

const claimSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CartRewardCampaign",
      required: true
    },
    tierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CartRewardTier",
      required: true
    },
    rewardId: {
      type: mongoose.Schema.Types.ObjectId
    },
    rewardVariantId: {
      type: String,
      required: true
    },
    cartToken: {
      type: String,
      index: true
    },
    checkoutToken: String,
    claimTokenHash: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["issued", "claimed", "removed", "expired", "converted", "rejected"],
      default: "issued",
      index: true
    },
    cartSubtotalAtClaim: Number,
    currencyCode: String,
    quantity: {
      type: Number,
      default: 1
    },
    lineKey: String,
    expiresAt: {
      type: Date,
      index: true
    },
    orderId: String,
    orderName: String,
    convertedAt: Date,
    metadata: {
      type: Object,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

claimSchema.index({ shopDomain: 1, campaignId: 1, status: 1 });
claimSchema.index({ shopDomain: 1, cartToken: 1, rewardVariantId: 1 });

module.exports = mongoose.models.CartRewardClaim ||
  mongoose.model("CartRewardClaim", claimSchema);
