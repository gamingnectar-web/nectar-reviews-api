const mongoose = require("mongoose");

const surfacesSchema = new mongoose.Schema(
  {
    cartDrawer: { type: Boolean, default: true },
    cartPage: { type: Boolean, default: true },
    checkout: { type: Boolean, default: true },
    miniProgress: { type: Boolean, default: false }
  },
  { _id: false }
);

const drawerSchema = new mongoose.Schema(
  {
    behaviour: {
      type: String,
      enum: ["embedded", "sticky", "collapsible"],
      default: "embedded"
    },
    position: {
      type: String,
      enum: ["top", "after_items", "before_checkout", "theme_block"],
      default: "theme_block"
    },
    collapsedOnMobile: { type: Boolean, default: false },
    maxHeight: { type: Number, default: 520 }
  },
  { _id: false }
);

const designSchema = new mongoose.Schema(
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
    name: {
      type: String,
      default: "Default Cart Rewards"
    },
    widgetTitle: {
      type: String,
      default: "Your rewards"
    },
    widgetSubtitle: {
      type: String,
      default: "Add more to unlock free gifts."
    },
    progressText: {
      type: String,
      default: "Spend {{amount_remaining}} more to unlock {{reward_title}}"
    },
    unlockedText: {
      type: String,
      default: "Unlocked"
    },
    lockedText: {
      type: String,
      default: "Locked"
    },
    claimedText: {
      type: String,
      default: "Added"
    },
    chooseText: {
      type: String,
      default: "Choose reward"
    },
    addButtonText: {
      type: String,
      default: "Add reward"
    },
    removeButtonText: {
      type: String,
      default: "Remove"
    },
    primaryColor: {
      type: String,
      default: "#111827"
    },
    accentColor: {
      type: String,
      default: "#f5b301"
    },
    backgroundColor: {
      type: String,
      default: "#ffffff"
    },
    cardBackgroundColor: {
      type: String,
      default: "#f8fafc"
    },
    borderColor: {
      type: String,
      default: "#e5e7eb"
    },
    textColor: {
      type: String,
      default: "#111827"
    },
    mutedTextColor: {
      type: String,
      default: "#6b7280"
    },
    borderRadius: {
      type: Number,
      default: 16
    },
    layout: {
      type: String,
      enum: ["cards", "premium_cards", "compact", "drawer", "timeline"],
      default: "premium_cards"
    },
    density: {
      type: String,
      enum: ["compact", "comfortable", "spacious"],
      default: "comfortable"
    },
    progressStyle: {
      type: String,
      enum: ["bar", "steps", "minimal"],
      default: "bar"
    },
    imageShape: {
      type: String,
      enum: ["rounded", "circle", "square"],
      default: "rounded"
    },
    surfaces: {
      type: surfacesSchema,
      default: () => ({})
    },
    drawer: {
      type: drawerSchema,
      default: () => ({})
    },
    drawerBehaviour: {
      type: String,
      enum: ["embedded", "sticky", "collapsible"],
      default: "embedded"
    },
    showProgressBar: {
      type: Boolean,
      default: true
    },
    showRewardImages: {
      type: Boolean,
      default: true
    },
    showLockedRewards: {
      type: Boolean,
      default: true
    },
    showRemoveButton: {
      type: Boolean,
      default: true
    },
    showThresholdLabels: {
      type: Boolean,
      default: true
    },
    mobileCollapsed: {
      type: Boolean,
      default: false
    },
    customCss: String
  },
  {
    timestamps: true
  }
);

designSchema.index({ shopDomain: 1, campaignId: 1 });

module.exports = mongoose.models.CartRewardDesign ||
  mongoose.model("CartRewardDesign", designSchema);
