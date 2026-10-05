const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
  version: { type: Number, required: true },
  publishedAt: { type: Date, default: Date.now },
  publishedBy: { type: String, default: '' },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const schema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  draft: { type: mongoose.Schema.Types.Mixed, default: {} },
  published: { type: mongoose.Schema.Types.Mixed, default: {} },
  publishedVersion: { type: Number, default: 0 },
  publishedAt: { type: Date, default: null },
  history: { type: [versionSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.models.Elev8CustomerHubConfig || mongoose.model('Elev8CustomerHubConfig', schema);
