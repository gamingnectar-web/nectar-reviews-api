const mongoose = require('mongoose');
const schema = new mongoose.Schema({ shopDomain: { type: String, index: true }, name: String, config: { type: mongoose.Schema.Types.Mixed, default: {} } }, { timestamps: true });
module.exports = mongoose.models.CartRewardDesign || mongoose.model('CartRewardDesign', schema, 'cartrewarddesigns');
