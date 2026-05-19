const nodemailer = require('nodemailer');
const { config } = require('../../core/config');
const { cleanShopDomain } = require('../../core/http/request-utils');
const { encryptSecret, decryptSecret, hashValue } = require('../../core/security/credentials.service');
const { createCustomerKey, createScopedHash } = require('../../core/security/customer-identity.service');
const EmailProviderSettings = require('./email-provider-settings.model');
const CampaignEvent = require('./campaign-event.model');
const { createReviewRequestLink } = require('../reviews/reviews.service');
const { renderReviewRequestEmail, renderReviewRewardEmail } = require('./templates.service');

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
      lastTestStatus: '',
      lastTestError: ''
    };
  }
  return {
    enabled: Boolean(settings.enabled),
    provider: settings.provider || 'none',
    smtpHost: settings.smtpHost || '',
    smtpPort: settings.smtpPort || '',
    secureMode: settings.secureMode || 'starttls',
    smtpUser: settings.smtpUser || '',
    smtpPasswordSet: Boolean(settings.smtpPassEncrypted),
    fromName: settings.fromName || '',
    fromEmail: settings.fromEmail || '',
    replyToEmail: settings.replyToEmail || '',
    lastTestedAt: settings.lastTestedAt || null,
    lastTestStatus: settings.lastTestStatus || '',
    lastTestError: settings.lastTestError || ''
  };
}

async function getEmailSettings(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  const settings = await EmailProviderSettings.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $setOnInsert: { shopDomain: cleanShop } },
    { new: true, upsert: true }
  );
  return settings;
}

async function updateEmailSettings(shopDomain, payload) {
  const cleanShop = cleanShopDomain(shopDomain);
  const update = {
    enabled: Boolean(payload.enabled),
    provider: payload.provider || 'smtp',
    smtpHost: payload.smtpHost || '',
    smtpPort: Number(payload.smtpPort || 587),
    secureMode: payload.secureMode || 'starttls',
    smtpUser: payload.smtpUser || '',
    fromName: payload.fromName || '',
    fromEmail: payload.fromEmail || '',
    replyToEmail: payload.replyToEmail || ''
  };
  if (payload.smtpPass) update.smtpPassEncrypted = encryptSecret(payload.smtpPass);
  if (payload.clearPassword) update.smtpPassEncrypted = '';

  return EmailProviderSettings.findOneAndUpdate(
    { shopDomain: cleanShop },
    { $set: { ...update, shopDomain: cleanShop } },
    { new: true, upsert: true, runValidators: true }
  );
}

function createTransport(settings) {
  if (!settings.enabled) throw new Error('Email provider is disabled.');
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassEncrypted) {
    throw new Error('SMTP host, user and password are required.');
  }
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: Number(settings.smtpPort || 587),
    secure: settings.secureMode === 'ssl' || Number(settings.smtpPort) === 465,
    auth: {
      user: settings.smtpUser,
      pass: decryptSecret(settings.smtpPassEncrypted)
    }
  });
}

async function sendEmail(shopDomain, mail) {
  const settings = await getEmailSettings(shopDomain);
  const transporter = createTransport(settings);
  const fromEmail = settings.fromEmail || settings.smtpUser;
  const fromName = settings.fromName || 'Nectar Reviews';
  return transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    replyTo: settings.replyToEmail || fromEmail,
    ...mail
  });
}

async function testEmail(shopDomain, to) {
  const cleanShop = cleanShopDomain(shopDomain);
  const settings = await getEmailSettings(cleanShop);
  try {
    const result = await sendEmail(cleanShop, {
      to,
      subject: 'Nectar Reviews test email',
      text: 'Your Nectar Reviews SMTP settings are working.',
      html: '<p>Your Nectar Reviews SMTP settings are working.</p>'
    });
    settings.lastTestedAt = new Date();
    settings.lastTestStatus = 'success';
    settings.lastTestError = '';
    await settings.save();
    return result;
  } catch (error) {
    settings.lastTestedAt = new Date();
    settings.lastTestStatus = 'failed';
    settings.lastTestError = error.message;
    await settings.save();
    throw error;
  }
}

async function logCampaignEvent({ shopDomain, eventType, campaign = 'review_request', orderKey = '', recipientHash = '', customerKey = '', itemId = '', url = '', token = '', req = null, meta = {} }) {
  return CampaignEvent.create({
    shopDomain: cleanShopDomain(shopDomain),
    campaign,
    eventType,
    orderKey,
    recipientHash,
    customerKey,
    itemId,
    urlHash: url ? hashValue(url) : '',
    tokenHash: token ? hashValue(token) : '',
    userAgentHash: hashValue(req?.headers?.['user-agent'] || ''),
    ipHash: hashValue(req?.ip || req?.headers?.['x-forwarded-for'] || ''),
    meta
  });
}

async function sendReviewRequest(payload) {
  const shopDomain = cleanShopDomain(payload.shopDomain);
  const to = payload.to || payload.email;
  if (!shopDomain || !to) {
    const error = new Error('shopDomain and recipient email are required.');
    error.statusCode = 400;
    throw error;
  }

  const items = Array.isArray(payload.items) && payload.items.length ? payload.items : [{ itemId: payload.itemId, itemTitle: payload.itemTitle }];
  const emailItems = [];

  for (const item of items) {
    const link = await createReviewRequestLink({
      shopDomain,
      customerId: payload.customerId || payload.customer_id || '',
      orderId: payload.orderId || '',
      itemId: item.itemId,
      itemTitle: item.itemTitle || '',
      campaign: payload.campaign || 'review_request'
    });
    const clickUrl = `${config.appBaseUrl}/api/messaging/track/click/${link.token}`;
    emailItems.push({ ...item, token: link.token, reviewUrl: clickUrl });
  }

  const firstToken = emailItems[0]?.token || '';
  const trackingOpenUrl = firstToken ? `${config.appBaseUrl}/api/messaging/track/open/${firstToken}.gif` : '';
  const rendered = renderReviewRequestEmail({
    customerName: payload.customerName,
    shopName: payload.shopName || shopDomain,
    items: emailItems,
    trackingOpenUrl
  });

  const result = await sendEmail(shopDomain, {
    to,
    subject: payload.subject || rendered.subject,
    html: payload.html || rendered.html,
    text: payload.text || rendered.text
  });

  for (const item of emailItems) {
    await logCampaignEvent({
      shopDomain,
      eventType: 'sent',
      campaign: payload.campaign || 'review_request',
      orderKey: createScopedHash(shopDomain, payload.orderId || ''),
      recipientHash: createScopedHash(shopDomain, to),
      customerKey: createCustomerKey(shopDomain, payload.customerId || payload.customer_id || ''),
      itemId: item.itemId || '',
      token: item.token
    });
  }

  return { messageId: result.messageId, items: emailItems.map((item) => ({ itemId: item.itemId, itemTitle: item.itemTitle, token: item.token, reviewUrl: item.reviewUrl })) };
}

async function sendReviewRewardEmail({ shopDomain, review, reward, discountCode, transientRecipientEmail, shopName }) {
  const to = transientRecipientEmail || review?.transientEmail || reward?.transientEmail || '';
  // Privacy default: reward emails are only sent when a transient recipient is deliberately supplied.
  // The app does not persist customer email or raw discount codes for later use.
  if (!to || !discountCode) return null;
  const rendered = renderReviewRewardEmail({
    customerName: review?.customerName || '',
    shopName: shopName || shopDomain,
    discountCode,
    discountType: reward.discountType,
    discountValue: reward.discountValue,
    appBaseUrl: config.appBaseUrl
  });
  const result = await sendEmail(shopDomain, {
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text
  });
  await logCampaignEvent({
    shopDomain,
    eventType: 'sent',
    campaign: 'review_reward',
    recipientHash: createScopedHash(shopDomain, to),
    customerKey: review?.customerKey || reward?.customerKey || '',
    itemId: review?.itemId || '',
    meta: { rewardId: reward._id || reward.id || '', discountCodePreview: reward.discountCodePreview || '' }
  });
  return result;
}

async function campaignAnalytics(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain);
  const counts = await CampaignEvent.aggregate([
    { $match: { shopDomain: cleanShop } },
    { $group: { _id: '$eventType', count: { $sum: 1 } } }
  ]);
  const byType = counts.reduce((acc, entry) => ({ ...acc, [entry._id]: entry.count }), {});
  return {
    sent: byType.sent || 0,
    opened: byType.open || 0,
    clicked: byType.click || 0,
    failed: byType.failed || 0,
    openRate: byType.sent ? Math.round(((byType.open || 0) / byType.sent) * 1000) / 10 : 0,
    clickRate: byType.sent ? Math.round(((byType.click || 0) / byType.sent) * 1000) / 10 : 0
  };
}

module.exports = {
  publicEmailSettings,
  getEmailSettings,
  updateEmailSettings,
  sendEmail,
  testEmail,
  logCampaignEvent,
  sendReviewRequest,
  sendReviewRewardEmail,
  campaignAnalytics
};
