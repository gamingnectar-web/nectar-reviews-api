const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerRefHash: { type: String, default: '', index: true },
  emailEncrypted: { type: String, default: '' },
  type: { type: String, enum: ['restock','price_drop','order_tracking','product_news'], required: true, index: true },
  resourceKeyHash: { type: String, default: '', index: true },
  productId: { type: String, default: '' },
  variantId: { type: String, default: '' },
  productHandle: { type: String, default: '' },
  orderIdEncrypted: { type: String, default: '' },
  orderNameEncrypted: { type: String, default: '' },
  trackingNumberEncrypted: { type: String, default: '' },
  carrier: { type: String, default: '' },
  channels: { inApp: { type: Boolean, default: true }, email: { type: Boolean, default: true } },
  stateEncrypted: { type: String, default: '' },
  active: { type: Boolean, default: true, index: true },
  lastCheckedAt: { type: Date, default: null },
  lastNotifiedAt: { type: Date, default: null }
}, { timestamps: true });

schema.index(
  { shopDomain: 1, customerRefHash: 1, type: 1, resourceKeyHash: 1 },
  { unique: true, partialFilterExpression: { customerRefHash: { $type: 'string' }, resourceKeyHash: { $type: 'string' } } }
);
module.exports = mongoose.models.Elev8NotificationSubscription || mongoose.model('Elev8NotificationSubscription', schema);
