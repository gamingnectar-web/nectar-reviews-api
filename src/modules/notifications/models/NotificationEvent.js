const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerRefHash: { type: String, default: '', index: true },
  emailEncrypted: { type: String, default: '' },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  eventKey: { type: String, required: true },
  type: { type: String, enum: ['restock','price_drop','tracking','product_news','system'], required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  urlEncrypted: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  dataEncrypted: { type: String, default: '' },
  readAt: { type: Date, default: null, index: true },
  delivered: { inApp: { type: Boolean, default: true }, email: { type: Boolean, default: false } },
  deliveredAt: { type: Date, default: null }
}, { timestamps: true });

schema.index(
  { shopDomain: 1, customerRefHash: 1, eventKey: 1 },
  { unique: true, partialFilterExpression: { customerRefHash: { $type: 'string' } } }
);
schema.index({ shopDomain: 1, customerRefHash: 1, createdAt: -1 });
module.exports = mongoose.models.Elev8NotificationEvent || mongoose.model('Elev8NotificationEvent', schema);
