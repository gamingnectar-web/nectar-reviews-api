const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  pageEnabled: { type: Boolean, default: false },
  restockEnabled: { type: Boolean, default: true },
  priceDropEnabled: { type: Boolean, default: true },
  trackingEnabled: { type: Boolean, default: true },
  productNewsEnabled: { type: Boolean, default: false },
  emailEnabled: { type: Boolean, default: false },
  pageTitle: { type: String, default: 'Your notifications' },
  pageIntro: { type: String, default: 'Track orders, products and the things you want to hear about.' },
  pollMinutes: { type: Number, default: 15, min: 5, max: 1440 }
}, { timestamps: true });
module.exports = mongoose.models.Elev8NotificationConfig || mongoose.model('Elev8NotificationConfig', schema);
