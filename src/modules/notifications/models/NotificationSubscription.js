const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerId: { type: String, required: true, index: true },
  email: { type: String, default: '' },
  type: { type: String, enum: ['restock','price_drop','order_tracking','product_news'], required: true, index: true },
  resourceKey: { type: String, required: true, index: true },
  productId: { type: String, default: '' },
  variantId: { type: String, default: '' },
  productHandle: { type: String, default: '' },
  orderId: { type: String, default: '' },
  orderName: { type: String, default: '' },
  trackingNumber: { type: String, default: '' },
  carrier: { type: String, default: '' },
  channels: { inApp: { type: Boolean, default: true }, email: { type: Boolean, default: true } },
  state: { type: mongoose.Schema.Types.Mixed, default: {} },
  active: { type: Boolean, default: true, index: true },
  lastCheckedAt: { type: Date, default: null },
  lastNotifiedAt: { type: Date, default: null }
}, { timestamps: true });

schema.index({ shopDomain: 1, customerId: 1, type: 1, resourceKey: 1 }, { unique: true });
module.exports = mongoose.models.Elev8NotificationSubscription || mongoose.model('Elev8NotificationSubscription', schema);
