const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  customerId: { type: String, required: true, index: true },
  email: { type: String, default: '' },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  eventKey: { type: String, required: true },
  type: { type: String, enum: ['restock','price_drop','tracking','product_news','system'], required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  url: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  readAt: { type: Date, default: null, index: true },
  delivered: { inApp: { type: Boolean, default: true }, email: { type: Boolean, default: false } },
  deliveredAt: { type: Date, default: null }
}, { timestamps: true });

schema.index({ shopDomain: 1, customerId: 1, eventKey: 1 }, { unique: true });
schema.index({ shopDomain: 1, customerId: 1, createdAt: -1 });
module.exports = mongoose.models.Elev8NotificationEvent || mongoose.model('Elev8NotificationEvent', schema);
