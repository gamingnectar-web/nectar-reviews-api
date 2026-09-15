const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  stage: { type: String, default: '' },
  message: { type: String, default: '' },
  detail: { type: String, default: '' },
  status: { type: String, enum: ['info','success','warning','error'], default: 'info' },
}, { _id: false });

const schema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  sourceUrl: { type: String, required: true },
  brandName: { type: String, default: '' },
  status: { type: String, enum: ['queued','running','complete','failed'], default: 'queued', index: true },
  stage: { type: String, default: 'queued' },
  progress: { type: Number, default: 0 },
  headline: { type: String, default: 'Queued' },
  detail: { type: String, default: '' },
  logs: { type: [logSchema], default: [] },
  discoveredCount: { type: Number, default: 0 },
  processedCount: { type: Number, default: 0 },
  productLineCount: { type: Number, default: 0 },
  profileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  result: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: { type: String, default: '' },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'product_brand_scrape_jobs' });

module.exports = mongoose.models.ProductBrandScrapeJob ||
  mongoose.model('ProductBrandScrapeJob', schema);
