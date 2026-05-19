const mongoose = require('mongoose');
const { modelFromConnection } = require('../database');

const shopifyOAuthStateSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  state: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = modelFromConnection('core', 'ShopifyOAuthState', shopifyOAuthStateSchema, 'shopify_oauth_states');
