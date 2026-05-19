const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  betaMode: {
    enabled: { type: Boolean, default: false },
    email: { type: String, default: '' }
  },
  emailsSentTotal: { type: Number, default: 0 },
  autoApproveEnabled: { type: Boolean, default: false },
  autoApproveType: { type: String, enum: ['verified', 'all'], default: 'verified' },
  autoApproveMinStars: { type: Number, default: 4 },
  attributeProfiles: { type: Array, default: [] },
  requestLinks: {
    oneUseOnly: { type: Boolean, default: true },
    expiresAfterDays: { type: Number, default: 30 }
  },
  seo: {
    richSnippets: { type: Boolean, default: true }
  },
  widgetStyles: {
    widgetTitle: { type: String, default: 'Customer Reviews' },
    primaryColor: { type: String, default: '#000000' },
    starColor: { type: String, default: '#ffc700' },
    textSize: { type: Number, default: 15 },
    emptyMode: { type: String, default: 'stars_text' },
    emptyText: { type: String, default: 'No reviews yet.' }
  },
  cardStyles: {
    starSize: { type: Number, default: 14 },
    showCount: { type: Boolean, default: true }
  },
  carouselStyles: {
    layout: { type: String, enum: ['grid', 'infinite', 'masonry'], default: 'infinite' },
    autoplay: { type: Boolean, default: true },
    delay: { type: Number, default: 4000 },
    showArrows: { type: Boolean, default: false },
    limit: { type: Number, default: 10 }
  }
}, { timestamps: true });

module.exports = mongoose.models.Settings || mongoose.model('Settings', settingsSchema, 'settings');
