const mongoose = require("mongoose");

const designSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true
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
      enum: ["cards", "compact", "drawer", "timeline"],
      default: "cards"
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

module.exports = mongoose.models.CartRewardDesign ||
  mongoose.model("CartRewardDesign", designSchema);
