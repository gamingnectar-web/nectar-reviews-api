const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
  {
    shopDomain: { type: String, required: true, unique: true, index: true },
    accessToken: { type: String, default: '' },
    scopes: { type: String, default: '' },
    installedAt: { type: Date, default: Date.now },
    uninstalledAt: { type: Date },
    status: { type: String, enum: ['installed', 'uninstalled'], default: 'installed' }
  },
  { timestamps: true }
);

module.exports = mongoose.models.Shop || mongoose.model('Shop', shopSchema);
