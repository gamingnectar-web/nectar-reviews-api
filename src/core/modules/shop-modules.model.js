const mongoose = require('mongoose');

const shopModulesSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabledModules: { type: [String], default: ['reviews', 'messaging', 'help'] },
  moduleSettings: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.models.ShopModules || mongoose.model('ShopModules', shopModulesSchema, 'shop_modules');
