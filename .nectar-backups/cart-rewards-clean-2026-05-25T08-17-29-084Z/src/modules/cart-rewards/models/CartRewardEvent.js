const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CartRewardCampaign"
    },
    tierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CartRewardTier"
    },
    rewardVariantId: String,
    cartToken: String,
    eventType: {
      type: String,
      enum: [
        "impression",
        "unlock",
        "claim_issued",
        "claim_added_to_cart",
        "claim_removed",
        "claim_rejected",
        "conversion",
        "campaign_activated",
        "campaign_expired",
        "campaign_paused",
        "campaign_scheduled",
        "campaign_swapped"
      ],
      required: true,
      index: true
    },
    value: Number,
    currencyCode: String,
    properties: {
      type: Object,
      default: () => ({})
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

eventSchema.index({ shopDomain: 1, eventType: 1, occurredAt: -1 });
eventSchema.index({ shopDomain: 1, campaignId: 1, occurredAt: -1 });

module.exports = mongoose.models.CartRewardEvent ||
  mongoose.model("CartRewardEvent", eventSchema);
