const mongoose = require('mongoose');
const schema = new mongoose.Schema({ shopDomain: { type: String, index: true }, campaignId: String, eventType: String, meta: { type: mongoose.Schema.Types.Mixed, default: {} } }, { timestamps: true });
module.exports = mongoose.models.CartRewardEvent || mongoose.model('CartRewardEvent', schema, 'cartrewardevents');
