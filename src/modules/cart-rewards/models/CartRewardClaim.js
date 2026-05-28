const mongoose = require('mongoose');
const schema = new mongoose.Schema({ shopDomain: { type: String, index: true }, campaignId: String, tierId: String, customerRefHash: String, cartToken: String, status: { type: String, default: 'claimed' } }, { timestamps: true });
module.exports = mongoose.models.CartRewardClaim || mongoose.model('CartRewardClaim', schema, 'cartrewardclaims');
