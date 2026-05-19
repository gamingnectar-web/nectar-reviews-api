const mongoose = require('mongoose');
const { modelFromConnection } = require('../../core/database');

const campaignEventSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  campaign: { type: String, default: 'review_request', index: true },
  eventType: { type: String, enum: ['sent', 'open', 'click', 'failed'], required: true, index: true },
  orderKey: { type: String, default: '', index: true },
  recipientHash: { type: String, default: '', index: true },
  customerKey: { type: String, default: '', index: true },
  itemId: { type: String, default: '' },
  urlHash: { type: String, default: '' },
  tokenHash: { type: String, default: '', index: true },
  userAgentHash: { type: String, default: '' },
  ipHash: { type: String, default: '' },
  meta: { type: Object, default: {} }
}, { timestamps: true });

campaignEventSchema.index({ shopDomain: 1, campaign: 1, eventType: 1, createdAt: -1 });

module.exports = modelFromConnection('messaging', 'CampaignEvent', campaignEventSchema, 'campaign_events');
