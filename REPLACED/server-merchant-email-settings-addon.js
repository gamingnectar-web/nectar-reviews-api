/*
  Nectar Reviews — Merchant Email Settings Backend Addon
  File: server-merchant-email-settings-addon.js

  Add to server.js:
    const crypto = require('crypto');
    const nodemailer = require('nodemailer');

  Also add nodemailer to package.json dependencies.

  Add this code after mongoose is connected / after your other models,
  but before app.listen(...).

  Required Render env var:
    EMAIL_CREDENTIAL_SECRET

  Use a long random secret. Example terminal command:
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

  This encrypts each merchant/shop SMTP password in MongoDB.
*/

const EMAIL_SECRET = process.env.EMAIL_CREDENTIAL_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET || '';

function getEmailKey() {
  if (!EMAIL_SECRET || EMAIL_SECRET.length < 16) {
    throw new Error('EMAIL_CREDENTIAL_SECRET must be set in Render and should be a long random string.');
  }
  return crypto.createHash('sha256').update(EMAIL_SECRET).digest();
}

function encryptEmailSecret(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEmailKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decryptEmailSecret(value) {
  if (!value) return '';
  const [ivHex, tagHex, encryptedHex] = String(value).split(':');
  if (!ivHex || !tagHex || !encryptedHex) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEmailKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

const emailProviderSettingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  provider: { type: String, default: 'none' },
  smtpHost: String,
  smtpPort: { type: Number, default: 587 },
  secureMode: { type: String, default: 'starttls' },
  smtpUser: String,
  smtpPassEncrypted: String,
  fromName: String,
  fromEmail: String,
  replyToEmail: String,
  lastTestedAt: Date,
  lastTestStatus: String,
  lastTestError: String
}, { timestamps: true });

const EmailProviderSettings =
  mongoose.models.EmailProviderSettings ||
  mongoose.model('EmailProviderSettings', emailProviderSettingsSchema);

function publicEmailSettings(settings) {
  if (!settings) {
    return {
      enabled: false,
      provider: 'none',
      smtpHost: '',
      smtpPort: '',
      secureMode: 'starttls',
      smtpUser: '',
      smtpPasswordSet: false,
      fromName: '',
      fromEmail: '',
      replyToEmail: '',
      lastTestedAt: null,
      lastTestStatus: ''
    };
  }

  return {
    enabled: settings.enabled,
    provider: settings.provider || 'none',
    smtpHost: settings.smtpHost || '',
    smtpPort: settings.smtpPort || '',
    secureMode: settings.secureMode || 'starttls',
    smtpUser: settings.smtpUser || '',
    smtpPasswordSet: !!settings.smtpPassEncrypted,
    fromName: settings.fromName || '',
    fromEmail: settings.fromEmail || '',
    replyToEmail: settings.replyToEmail || '',
    lastTestedAt: settings.lastTestedAt || null,
    lastTestStatus: settings.lastTestStatus || '',
    lastTestError: settings.lastTestError || ''
  };
}

app.get('/api/admin/email-settings', async (req, res) => {
  try {
    const shopDomain = req.query.shopDomain;
    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });

    const settings = await EmailProviderSettings.findOne({ shopDomain });
    res.json(publicEmailSettings(settings));
  } catch (error) {
    console.error('Load email settings failed:', error);
    res.status(500).json({ error: 'Could not load email settings' });
  }
});

app.patch('/api/admin/email-settings', async (req, res) => {
  try {
    const {
      shopDomain,
      enabled,
      provider,
      smtpHost,
      smtpPort,
      secureMode,
      smtpUser,
      smtpPass,
      fromName,
      fromEmail,
      replyToEmail
    } = req.body || {};

    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });
    if (!provider || provider === 'none') return res.status(400).json({ error: 'Choose a provider' });
    if (!smtpHost || !smtpUser || !fromEmail) {
      return res.status(400).json({ error: 'SMTP host, username, and from email are required' });
    }

    const update = {
      shopDomain,
      enabled: enabled !== false,
      provider,
      smtpHost,
      smtpPort: Number(smtpPort || 587),
      secureMode: secureMode || 'starttls',
      smtpUser,
      fromName,
      fromEmail,
      replyToEmail
    };

    if (smtpPass) {
      update.smtpPassEncrypted = encryptEmailSecret(smtpPass);
    }

    const saved = await EmailProviderSettings.findOneAndUpdate(
      { shopDomain },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json(publicEmailSettings(saved));
  } catch (error) {
    console.error('Save email settings failed:', error);
    res.status(500).json({ error: error.message || 'Could not save email settings' });
  }
});

app.delete('/api/admin/email-settings', async (req, res) => {
  try {
    const { shopDomain } = req.body || {};
    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });

    await EmailProviderSettings.deleteOne({ shopDomain });
    res.json({ ok: true });
  } catch (error) {
    console.error('Clear email settings failed:', error);
    res.status(500).json({ error: 'Could not clear email settings' });
  }
});

app.post('/api/admin/test-email', async (req, res) => {
  const { shopDomain, to, subject, html } = req.body || {};

  try {
    if (!shopDomain) return res.status(400).json({ error: 'shopDomain is required' });
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
      return res.status(400).json({ error: 'A valid recipient email is required' });
    }
    if (!html) return res.status(400).json({ error: 'Email HTML is required' });

    const settings = await EmailProviderSettings.findOne({ shopDomain });
    if (!settings || !settings.enabled || !settings.smtpPassEncrypted) {
      return res.status(400).json({ error: 'Email provider is not configured for this shop' });
    }

    const smtpPass = decryptEmailSecret(settings.smtpPassEncrypted);

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort || 587),
      secure: settings.secureMode === 'ssl' || Number(settings.smtpPort) === 465,
      requireTLS: settings.secureMode === 'starttls',
      auth: {
        user: settings.smtpUser,
        pass: smtpPass
      }
    });

    const fromName = settings.fromName || 'Nectar Reviews';
    const fromEmail = settings.fromEmail || settings.smtpUser;

    await transporter.sendMail({
      from: `${fromName.replace(/"/g, '')} <${fromEmail}>`,
      to,
      replyTo: settings.replyToEmail || fromEmail,
      subject: subject || 'Review request test email',
      html
    });

    settings.lastTestedAt = new Date();
    settings.lastTestStatus = 'success';
    settings.lastTestError = '';
    await settings.save();

    res.json({ ok: true, message: 'Test email sent' });
  } catch (error) {
    console.error('Test email send failed:', error);

    if (shopDomain) {
      await EmailProviderSettings.findOneAndUpdate(
        { shopDomain },
        {
          $set: {
            lastTestedAt: new Date(),
            lastTestStatus: 'failed',
            lastTestError: error.message || 'Failed to send test email'
          }
        }
      ).catch(() => {});
    }

    res.status(500).json({ error: error.message || 'Failed to send test email' });
  }
});
