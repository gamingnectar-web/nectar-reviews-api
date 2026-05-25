const mongoose = require("mongoose");

const weeklyWindowSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      min: 0,
      max: 6,
      required: true
    },
    startTime: {
      type: String,
      required: true,
      match: /^\d{2}:\d{2}$/
    },
    endTime: {
      type: String,
      required: true,
      match: /^\d{2}:\d{2}$/
    }
  },
  { _id: false }
);

const marketThresholdSchema = new mongoose.Schema(
  {
    market: String,
    currencyCode: String,
    thresholdMultiplier: {
      type: Number,
      default: 1
    }
  },
  { _id: false }
);

const campaignRuleSchema = new mongoose.Schema(
  {
    includeProducts: [String],
    excludeProducts: [String],
    includeCollections: [String],
    excludeCollections: [String],
    markets: [marketThresholdSchema],
    allowWithDiscountCodes: {
      type: Boolean,
      default: true
    },
    usageLimitPerCart: {
      type: Number,
      default: 0
    },
    usageLimitTotal: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const inventoryBehaviourSchema = new mongoose.Schema(
  {
    /**
     * Default is strict: if the configured reward variant is unavailable, hide it.
     * Merchants can explicitly override per reward for continuation/back-order style promos.
     */
    soldOutBehaviour: {
      type: String,
      enum: ["hide", "disable", "continue_selling", "backup_only"],
      default: "hide"
    },
    hideEmptyTiers: {
      type: Boolean,
      default: true
    },
    hideEmptyCampaigns: {
      type: Boolean,
      default: true
    },
    preferBackupRewards: {
      type: Boolean,
      default: true
    }
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true
    },
    publicTitle: {
      type: String,
      default: "Unlock free rewards"
    },
    description: String,
    status: {
      type: String,
      enum: ["draft", "scheduled", "active", "paused", "expired", "archived"],
      default: "draft",
      index: true
    },
    triggerType: {
      type: String,
      enum: ["subtotal", "quantity", "product", "collection"],
      default: "subtotal"
    },
    rewardMode: {
      type: String,
      enum: ["stack_all", "highest_only", "choose_one"],
      default: "stack_all"
    },
    priority: {
      type: Number,
      default: 100
    },
    startsAt: Date,
    endsAt: Date,
    timezone: {
      type: String,
      default: "Europe/London"
    },
    activeWindows: [weeklyWindowSchema],
    blackoutDates: [Date],
    autoActivate: {
      type: Boolean,
      default: true
    },
    autoExpire: {
      type: Boolean,
      default: true
    },
    swapGroup: {
      type: String,
      index: true
    },
    nextCampaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CartRewardCampaign"
    },
    rules: {
      type: campaignRuleSchema,
      default: () => ({})
    },
    inventory: {
      type: inventoryBehaviourSchema,
      default: () => ({})
    },
    designId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CartRewardDesign"
    },
    analytics: {
      impressions: { type: Number, default: 0 },
      unlocks: { type: Number, default: 0 },
      claims: { type: Number, default: 0 },
      removals: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      influencedRevenue: { type: Number, default: 0 }
    },
    launchChecklist: {
      hasTiers: { type: Boolean, default: false },
      hasRewards: { type: Boolean, default: false },
      hasDesign: { type: Boolean, default: false },
      hasSchedule: { type: Boolean, default: false },
      functionEnabled: { type: Boolean, default: false },
      themeBlockEnabled: { type: Boolean, default: false },
      checkoutExtensionEnabled: { type: Boolean, default: false }
    },
    createdBy: String,
    updatedBy: String
  },
  {
    timestamps: true
  }
);

campaignSchema.index({ shopDomain: 1, status: 1, startsAt: 1, endsAt: 1 });
campaignSchema.index({ shopDomain: 1, swapGroup: 1, priority: 1 });

module.exports = mongoose.models.CartRewardCampaign ||
  mongoose.model("CartRewardCampaign", campaignSchema);
