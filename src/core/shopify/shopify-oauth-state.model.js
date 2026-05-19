const mongoose = require('mongoose');

const shopifyOAuthStateSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  state: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.models.ShopifyOAuthState || mongoose.model('ShopifyOAuthState', shopifyOAuthStateSchema, 'shopify_oauth_states');
