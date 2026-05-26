const mongoose = require('mongoose');

const supportRequestSchema = new mongoose.Schema(
  {
    shopDomain: { type: String, index: true },
    name: String,
    emailHash: String,
    topic: String,
    message: String,
    status: { type: String, enum: ['open', 'closed'], default: 'open' }
  },
  { timestamps: true }
);

module.exports = mongoose.models.SupportRequest || mongoose.model('SupportRequest', supportRequestSchema);
