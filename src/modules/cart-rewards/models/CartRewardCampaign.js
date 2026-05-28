const mongoose = require('mongoose');
const schema = new mongoose.Schema({ shopDomain: { type: String, index: true }, name: String, startsAt: Date, endsAt: Date, enabled: { type: Boolean, default: false }, design: { type: mongoose.Schema.Types.Mixed, default: {} } }, { timestamps: true });
module.exports = mongoose.models.CartRewardCampaign || mongoose.model('CartRewardCampaign', schema, 'cartrewardcampaigns');
