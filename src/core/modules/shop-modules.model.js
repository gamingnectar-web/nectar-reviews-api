const mongoose = require('mongoose');
const { modelFromConnection } = require('../database');

const shopModulesSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabledModules: { type: [String], default: ['reviews', 'messaging', 'discounts', 'loyalty', 'help'] },
  moduleSettings: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = modelFromConnection('core', 'ShopModules', shopModulesSchema, 'shop_modules');
