const mongoose = require('mongoose');

const emailProviderSettingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  provider: { type: String, default: 'none' },
  smtpHost: { type: String, default: '' },
  smtpPort: { type: Number, default: 587 },
  secureMode: { type: String, default: 'starttls' },
  smtpUser: { type: String, default: '' },
  smtpPassEncrypted: { type: String, default: '' },
  fromName: { type: String, default: '' },
  fromEmail: { type: String, default: '' },
  replyToEmail: { type: String, default: '' },
  lastTestedAt: { type: Date },
  lastTestStatus: { type: String, default: '' },
  lastTestError: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.models.EmailProviderSettings || mongoose.model('EmailProviderSettings', emailProviderSettingsSchema, 'email_provider_settings');
