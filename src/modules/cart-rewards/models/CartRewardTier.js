const mongoose = require("mongoose");

const rewardProductSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true
    },
    variantId: {
      type: String,
      required: true
    },
    handle: String,
    title: String,
    variantTitle: String,
    imageUrl: String,
    quantity: {
      type: Number,
      default: 1,
      min: 1
    },
    discountType: {
      type: String,
      enum: ["free", "percentage_off", "fixed_price"],
      default: "free"
    },
    discountValue: {
      type: Number,
      default: 100
    },
    /**
     * Strict default: hide rewards when the store says the variant cannot be sold.
     * `continue_selling` must be selected deliberately by the merchant.
     */
    outOfStockBehaviour: {
      type: String,
      enum: ["hide", "disable", "continue_selling", "backup_only"],
      default: "hide"
    },
    /**
     * Backwards-compatible field for older drafts. Prefer outOfStockBehaviour in new UI.
     */
    inventoryPolicy: {
      type: String,
      enum: ["hide_when_oos", "disable_when_oos", "allow_backorder"],
      default: "hide_when_oos"
    },
    inventoryQuantity: Number,
    availableForSale: Boolean,
    lastInventorySyncAt: Date,
    backupForRewardId: String,
    isBackup: {
      type: Boolean,
      default: false
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  },
  { _id: true }
);

const tierSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CartRewardCampaign",
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true
    },
    description: String,
    thresholdType: {
      type: String,
      enum: ["subtotal", "quantity"],
      default: "subtotal"
    },
    thresholdValue: {
      type: Number,
      required: true
    },
    currencyCode: {
      type: String,
      default: "GBP"
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    isStackable: {
      type: Boolean,
      default: true
    },
    maxClaimsPerCart: {
      type: Number,
      default: 1
    },
    rewards: [rewardProductSchema],
    badgeText: String,
    lockedText: String,
    unlockedText: String,
    active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

tierSchema.index({ shopDomain: 1, campaignId: 1, sortOrder: 1 });
tierSchema.index({ shopDomain: 1, campaignId: 1, thresholdValue: 1 });

module.exports = mongoose.models.CartRewardTier ||
  mongoose.model("CartRewardTier", tierSchema);
