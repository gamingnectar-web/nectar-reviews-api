const express = require('express');
const nodemailer = require('nodemailer');
const { Shop, EmailProviderSettings, CampaignEvent } = require('../models');
const { getLoyaltyModels } = require('../modules/loyalty/loyalty.models');
const { requireAdminSession } = require('../utils/security');
const { cleanText, cleanEmail, clampNumber } = require('../utils/validation');
const { env } = require('../config/env');
const { decryptSecret } = require('../utils/crypto');
const { getOrCreateLoyaltyProgram, cleanLoyaltyConfig, cleanRewardTemplate, cleanPointsRule } = require('../modules/loyalty/loyalty.service');

const router = express.Router();
router.use(requireAdminSession);

function shopDomainFromReq(req) {
  return req.shopDomain;
}

router.get('/config', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    await Shop.findOneAndUpdate(
      { shopDomain },
      { $set: { 'modules.loyalty.enabled': Boolean(program.enabled) }, $setOnInsert: { shopDomain } },
      { upsert: true }
    );
    return res.json(program);
  } catch (error) {
    next(error);
  }
});

router.patch('/config', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const update = cleanLoyaltyConfig(shopDomain, req.body || {});
    const { LoyaltyProgram } = getLoyaltyModels();
    const program = await LoyaltyProgram.findOneAndUpdate(
      { shopDomain },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await Shop.findOneAndUpdate(
      { shopDomain },
      { $set: { 'modules.loyalty.enabled': Boolean(program.enabled) }, $setOnInsert: { shopDomain } },
      { upsert: true }
    );
    return res.json(program);
  } catch (error) {
    next(error);
  }
});

router.post('/reward-templates', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const template = cleanRewardTemplate(req.body || {});
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    program.rewardTemplates = [...(program.rewardTemplates || []), template].slice(0, 20);
    await program.save();
    return res.status(201).json({ ok: true, template, program });
  } catch (error) {
    next(error);
  }
});

router.post('/points-rules', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const rule = cleanPointsRule(req.body || {});
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    program.pointsRules = [...(program.pointsRules || []), rule].slice(0, 20);
    await program.save();
    return res.status(201).json({ ok: true, rule, program });
  } catch (error) {
    next(error);
  }
});

router.delete('/reward-templates/:id', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const id = cleanText(req.params.id, 80);
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    program.rewardTemplates = (program.rewardTemplates || []).filter((template) => template.id !== id);
    await program.save();
    return res.json({ ok: true, program });
  } catch (error) {
    next(error);
  }
});

router.delete('/points-rules/:id', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const id = cleanText(req.params.id, 80);
    const program = await getOrCreateLoyaltyProgram(shopDomain);
    program.pointsRules = (program.pointsRules || []).filter((rule) => rule.id !== id);
    await program.save();
    return res.json({ ok: true, program });
  } catch (error) {
    next(error);
  }
});

router.get('/ledger', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const limit = clampNumber(req.query.limit, 1, 100, 25);
    const { LoyaltyLedger } = getLoyaltyModels();
    const rows = await LoyaltyLedger.find({ shopDomain })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ rows });
  } catch (error) {
    next(error);
  }
});


router.post('/test-email', async (req, res, next) => {
  const shopDomain = shopDomainFromReq(req);
  try {
    const to = cleanEmail(req.body.to);
    if (!to) return res.status(400).json({ error: 'A valid recipient email is required.' });
    const settings = await EmailProviderSettings.findOne({ shopDomain });
    if (!settings || !settings.enabled || !settings.smtpPassEncrypted) {
      return res.status(400).json({ error: 'Email provider is not configured for this shop.' });
    }
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort || 587),
      secure: settings.secureMode === 'ssl' || Number(settings.smtpPort) === 465,
      requireTLS: settings.secureMode === 'starttls',
      auth: { user: settings.smtpUser, pass: decryptSecret(settings.smtpPassEncrypted) },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    const token = `loyalty-test-${Date.now()}`;
    const trackingPixel = `${env.appUrl || ''}/api/campaign/open?shopDomain=${encodeURIComponent(shopDomain)}&campaign=loyalty_test_reward&email=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}&t=${Date.now()}`;
    let html = String(req.body.html || '').slice(0, 200000);
    if (!html) html = '<p>Your loyalty reward is ready.</p>';
    if (!html.includes('/api/campaign/open')) html += `<img src="${trackingPixel}" width="1" height="1" alt="" style="display:none;opacity:0;width:1px;height:1px;">`;
    const fromName = settings.fromName || 'Nectar Loyalty';
    const fromEmail = settings.fromEmail || settings.smtpUser;
    await transporter.sendMail({
      from: `${fromName.replace(/"/g, '')} <${fromEmail}>`,
      to,
      replyTo: settings.replyToEmail || fromEmail,
      subject: cleanText(req.body.subject || 'Your review reward is ready', 160),
      html,
    });
    await CampaignEvent.create({ shopDomain, campaign: 'loyalty_test_reward', eventType: 'sent', email: to, token, userAgent: cleanText(req.headers['user-agent'], 500) });
    return res.json({ ok: true, message: 'Loyalty test email sent.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
