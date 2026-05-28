const mongoose = require("mongoose");

const templateSchema = new mongoose.Schema(
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
    category: {
      type: String,
      enum: ["aov_boost", "launch", "seasonal", "premium", "clearance", "custom"],
      default: "custom"
    },
    description: String,
    tags: [String],
    campaignSnapshot: {
      type: Object,
      required: true
    },
    tierSnapshots: {
      type: [Object],
      default: () => []
    },
    designSnapshot: {
      type: Object,
      default: () => ({})
    },
    isSystemTemplate: {
      type: Boolean,
      default: false
    },
    usageCount: {
      type: Number,
      default: 0
    },
    lastUsedAt: Date
  },
  {
    timestamps: true
  }
);

templateSchema.index({ shopDomain: 1, category: 1, name: 1 });

module.exports = mongoose.models.CartRewardTemplate ||
  mongoose.model("CartRewardTemplate", templateSchema);
