const mongoose = require('mongoose');
const { modelFromConnection } = require('../database');

const shopifyInstallationSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  accessToken: { type: String, required: true },
  scope: { type: String, default: '' },
  installedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = modelFromConnection('core', 'ShopifyInstallation', shopifyInstallationSchema, 'shopify_installations');
