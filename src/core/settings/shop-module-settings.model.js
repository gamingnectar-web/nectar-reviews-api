const mongoose = require('mongoose');

const shopModuleSettingsSchema = new mongoose.Schema(
  {
    shopDomain: { type: String, required: true, unique: true, index: true },
    modules: {
      type: Map,
      of: Boolean,
      default: {}
    }
  },
  { timestamps: true }
);

module.exports = mongoose.models.ShopModuleSettings || mongoose.model('ShopModuleSettings', shopModuleSettingsSchema);
