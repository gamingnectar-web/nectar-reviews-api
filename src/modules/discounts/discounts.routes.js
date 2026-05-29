const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { Shop, EmailProviderSettings, CampaignEvent } = require('../../models');
const { cleanText, cleanEmail, clampNumber } = require('../../utils/validation');
const { decryptSecret } = require('../../utils/crypto');
const { DiscountIssue } = require('./discounts.models');
const { cleanDiscountConfig, getOrCreateDiscountProgram, issueDiscountCode, renderNames } = require('./discounts.service');

const router = express.Router();

function shopDomainFromReq(req) {
  return req.shopDomain;
}


function createTransporterFromSettings(settings) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: Number(settings.smtpPort || 587),
    secure: settings.secureMode === 'ssl' || Number(settings.smtpPort) === 465,
    requireTLS: settings.secureMode === 'starttls',
    auth: { user: settings.smtpUser, pass: decryptSecret(settings.smtpPassEncrypted) },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

function discountHumanValue(issue = {}) {
  if (issue.discountType === 'free_shipping') return 'free shipping';
  if (issue.discountType === 'percentage') return `${Number(issue.discountValue || 0)}% off`;
  return `${Number(issue.discountValue || 0).toFixed(2)} off`;
}

function renderDiscountEmail({ shopDomain, issue, emailBody = '' }) {
  const body = cleanText(emailBody || 'Thanks — your reward code is {{ code }}.', 2000)
    .replace(/\{\{\s*code\s*\}\}/gi, issue.code || '')
    .replace(/\{\{\s*discount_value\s*\}\}/gi, discountHumanValue(issue))
    .replace(/\{\{\s*discount_name\s*\}\}/gi, issue.templateName || 'Reward');
  const code = issue.code || 'NECTAR-CODE';
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#111827;background:#f3f4f6;padding:28px;"><div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:28px;text-align:center;"><p style="margin:0 0 8px;color:#667085;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:12px;">${issue.templateName || 'Your reward is ready'}</p><h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;">Your discount code is ready</h1><p style="margin:0 0 18px;color:#4b5563;">${body}</p><div style="display:inline-block;margin:8px auto 20px;padding:16px 22px;border:2px dashed #111827;border-radius:14px;font-size:24px;font-weight:900;letter-spacing:.06em;">${code}</div><p style="margin:0 0 18px;color:#667085;font-size:13px;">${discountHumanValue(issue)}${issue.expiresAt ? ` · expires ${new Date(issue.expiresAt).toLocaleDateString('en-GB')}` : ''}</p><a href="https://${shopDomain}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;border-radius:12px;padding:13px 18px;font-weight:800;">Shop now</a><p style="margin:22px 0 0;color:#98a2b3;font-size:12px;">Sent by ${shopDomain}</p></div></div>`;
}

async function sendDiscountIssueEmail({ shopDomain, issue, emailBody = '', subject = '' }) {
  const email = cleanEmail(issue.email);
  if (!email) return { sent: false, reason: 'No recipient email supplied.' };
  if (issue.status !== 'issued') {
    return { sent: false, reason: issue.status === 'failed' ? (issue.errorMessage || 'The Shopify code was not created.') : 'This is a draft/reserved code only, so no customer email was sent.' };
  }
  const settings = await EmailProviderSettings.findOne({ shopDomain });
  if (!settings || !settings.enabled || !settings.smtpPassEncrypted) {
    return { sent: false, reason: 'No active email provider with a saved app password is configured.' };
  }
  const fromEmail = settings.fromEmail || settings.smtpUser;
  const fromName = settings.fromName || 'Store Rewards';
  const transporter = createTransporterFromSettings(settings);
  const html = renderDiscountEmail({ shopDomain, issue, emailBody });
  const htmlHash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);
  const campaignToken = `discount-${issue._id}-${Date.now()}`;
  await transporter.sendMail({
    from: `${String(fromName).replace(/"/g, '')} <${fromEmail}>`,
    to: email,
    replyTo: settings.replyToEmail || fromEmail,
    subject: cleanText(subject || `${issue.templateName || 'Your'} discount code is ready`, 160),
    html,
  });
  await CampaignEvent.create({
    shopDomain,
    campaign: `discount_${issue.area || 'manual'}`,
    eventType: 'sent',
    email,
    orderId: issue.sourceId || '',
    token: campaignToken,
    subject: cleanText(subject || `${issue.templateName || 'Your'} discount code is ready`, 160),
    templateName: issue.templateName || 'Discount email',
    layoutName: 'discount_code_email',
    moduleNames: ['discount_code'],
    htmlHash,
  });
  issue.emailStatus = 'sent';
  issue.emailedAt = new Date();
  issue.emailSubject = cleanText(subject || `${issue.templateName || 'Your'} discount code is ready`, 160);
  await issue.save().catch(() => {});
  return { sent: true };
}

async function updateShopModule(shopDomain, enabled) {
  await Shop.findOneAndUpdate(
    { shopDomain },
    { $set: { 'modules.discounts.enabled': Boolean(enabled) }, $setOnInsert: { shopDomain } },
    { upsert: true }
  );
}

router.get('/config', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const program = await getOrCreateDiscountProgram(shopDomain);
    await updateShopModule(shopDomain, program.enabled);
    return res.json(program);
  } catch (error) {
    next(error);
  }
});

router.patch('/config', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const payload = cleanDiscountConfig(shopDomain, req.body || {});
    const program = await getOrCreateDiscountProgram(shopDomain);
    program.set(payload);
    await program.save();
    await updateShopModule(shopDomain, program.enabled);
    return res.json(program);
  } catch (error) {
    next(error);
  }
});

router.get('/issues', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const area = cleanText(req.query.area || '', 40);
    const limit = clampNumber(req.query.limit, 1, 200, 50);
    const query = { shopDomain };
    if (area) query.area = area;
    const rows = await DiscountIssue.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ rows });
  } catch (error) {
    next(error);
  }
});

router.post('/issue', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const override = req.body.override || {};
    const issue = await issueDiscountCode({
      shopDomain,
      templateId: cleanText(req.body.templateId || '', 100),
      area: cleanText(req.body.area || 'manual', 40),
      trigger: cleanText(req.body.trigger || 'manual', 80),
      sourceId: cleanText(req.body.sourceId || '', 180),
      customerRefHash: cleanText(req.body.customerRefHash || '', 180),
      email: req.body.email || '',
      override,
    });
    let emailResult = null;
    if (req.body.sendEmail === true || req.body.sendEmail === 'true') {
      emailResult = await sendDiscountIssueEmail({
        shopDomain,
        issue,
        emailBody: override.emailBody || '',
        subject: override.emailSubject || '',
      });
    }
    return res.status(201).json({ ok: true, issue, email: emailResult });
  } catch (error) {
    next(error);
  }
});

router.get('/render-names', async (req, res, next) => {
  try {
    return res.json({ rows: renderNames(shopDomainFromReq(req)) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
