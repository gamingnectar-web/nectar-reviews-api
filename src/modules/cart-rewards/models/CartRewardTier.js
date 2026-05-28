const mongoose = require('mongoose');
const schema = new mongoose.Schema({ shopDomain: { type: String, index: true }, name: String, threshold: Number, rewardType: String, rewardValue: Number, products: { type: [mongoose.Schema.Types.Mixed], default: [] }, enabled: { type: Boolean, default: true } }, { timestamps: true });
module.exports = mongoose.models.CartRewardTier || mongoose.model('CartRewardTier', schema, 'cartrewardtiers');
