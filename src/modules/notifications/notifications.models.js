const mongoose = require('mongoose');

const notificationConfigSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: true },
  restockEnabled: { type: Boolean, default: true },
  storefront: {
    inStockLabel: { type: String, default: 'Add to cart' },
    inStockBackground: { type: String, default: '#111111' },
    inStockTextColor: { type: String, default: '#ffffff' },
    soldOutLabel: { type: String, default: 'Notify me when available' },
    subscribedLabel: { type: String, default: 'Notification active' },
    removeLabel: { type: String, default: 'Remove alert' },
    modalTitle: { type: String, default: 'Get notified when it’s back' },
    modalCopy: { type: String, default: 'Enter your email and we’ll let you know as soon as this product is available again.' },
    style: { type: String, enum: ['outline', 'solid'], default: 'outline' },
    background: { type: String, default: '#111111' },
    textColor: { type: String, default: '#ffffff' },
    outlineColor: { type: String, default: '#d7dce1' },
    radius: { type: Number, default: 8, min: 0, max: 30 },
    height: { type: Number, default: 56, min: 44, max: 72 },
    showBellIcon: { type: Boolean, default: true },
  },
  email: {
    subject: { type: String, default: '{{ product_title }} is back in stock' },
    heading: { type: String, default: 'It’s back.' },
    body: { type: String, default: '{{ product_title }} is available again. Stock can move quickly, so take another look while it’s here.' },
    buttonLabel: { type: String, default: 'Shop now' },
    footer: { type: String, default: 'You received this one-time message because you asked to be notified when this item returned.' },
  },
  sendThreshold: { type: Number, default: 1, min: 1, max: 9999 },
  oneShot: { type: Boolean, default: true },
  webhook: {
    id: { type: String, default: '' },
    address: { type: String, default: '' },
    status: { type: String, default: '' },
    installedAt: { type: Date, default: null },
    lastReceivedAt: { type: Date, default: null },
    lastInventoryItemId: { type: String, default: '' },
  },
}, { timestamps: true });

const restockSubscriptionSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  emailHash: { type: String, required: true, index: true },
  emailEncrypted: { type: String, required: true },
  variantId: { type: String, required: true, index: true },
  productId: { type: String, default: '', index: true },
  productTitle: { type: String, default: '' },
  productHandle: { type: String, default: '' },
  productUrl: { type: String, default: '' },
  productImage: { type: String, default: '' },
  variantTitle: { type: String, default: '' },
  status: { type: String, enum: ['active', 'sending', 'sent', 'unsubscribed'], default: 'active', index: true },
  source: { type: String, default: 'storefront' },
  subscribedAt: { type: Date, default: Date.now },
  sentAt: { type: Date, default: null },
  unsubscribedAt: { type: Date, default: null },
  sendAttempts: { type: Number, default: 0 },
  lastAttemptAt: { type: Date, default: null },
  lastError: { type: String, default: '' },
  lastWebhookId: { type: String, default: '' },
}, { timestamps: true });
restockSubscriptionSchema.index({ shopDomain: 1, emailHash: 1, variantId: 1 }, { unique: true });
restockSubscriptionSchema.index({ shopDomain: 1, status: 1, variantId: 1, subscribedAt: -1 });
restockSubscriptionSchema.index({ shopDomain: 1, productId: 1, status: 1 });

const notificationEventSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  type: { type: String, required: true, index: true },
  variantId: { type: String, default: '', index: true },
  productId: { type: String, default: '' },
  productTitle: { type: String, default: '' },
  emailHash: { type: String, default: '' },
  detail: { type: String, default: '' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });
notificationEventSchema.index({ shopDomain: 1, occurredAt: -1 });

module.exports = {
  NotificationConfig: mongoose.models.NotificationConfig || mongoose.model('NotificationConfig', notificationConfigSchema, 'notification_configs'),
  RestockSubscription: mongoose.models.RestockSubscription || mongoose.model('RestockSubscription', restockSubscriptionSchema, 'restock_subscriptions'),
  NotificationEvent: mongoose.models.NotificationEvent || mongoose.model('NotificationEvent', notificationEventSchema, 'notification_events'),
};
