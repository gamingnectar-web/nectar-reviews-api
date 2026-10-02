const nodemailer = require('nodemailer');
const { EmailProviderSettings } = require('../../../models');
const NotificationEvent = require('../models/NotificationEvent');
const { sealText, openText, sealJson, openJson, redactText } = require('./privacyVault');

async function createEvent(input = {}) {
  const payload = {
    shopDomain: input.shopDomain,
    customerRefHash: input.customerRefHash || '',
    emailEncrypted: input.emailEncrypted || '',
    subscriptionId: input.subscriptionId || null,
    eventKey: input.eventKey,
    type: input.type,
    title: redactText(input.title || 'ELEV8 notification'),
    body: redactText(input.body || ''),
    urlEncrypted: sealText(input.url || ''),
    imageUrl: input.imageUrl || '',
    dataEncrypted: sealJson(input.data || {}),
    delivered: input.delivered || { inApp: true, email: false },
  };
  try { return await NotificationEvent.create(payload); }
  catch (error) { if (error?.code === 11000) return null; throw error; }
}

async function sendEventEmail(event) {
  if (!event?.emailEncrypted) return false;
  const recipient = openText(event.emailEncrypted);
  if (!recipient) return false;
  const settings = await EmailProviderSettings.findOne({ shopDomain:event.shopDomain, enabled:true }).lean();
  if (!settings?.smtpHost || !settings?.fromEmail || !settings?.smtpPassEncrypted) return false;
  const { decryptSecret } = require('../../../utils/crypto');
  const transporter = nodemailer.createTransport({
    host:settings.smtpHost,
    port:Number(settings.smtpPort||587),
    secure:settings.secureMode==='ssl',
    requireTLS:settings.secureMode==='starttls',
    auth:{user:settings.smtpUser,pass:decryptSecret(settings.smtpPassEncrypted)}
  });
  const title = redactText(event.title || 'ELEV8 notification');
  const body = redactText(event.body || '');
  const url = openText(event.urlEncrypted || '');
  await transporter.sendMail({
    from:`"${settings.fromName||'ELEV8'}" <${settings.fromEmail}>`,
    to:recipient,
    replyTo:settings.replyToEmail||undefined,
    subject:title,
    text:`${body}${url?`\n\n${url}`:''}`,
    html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h2>${title}</h2><p>${body}</p>${url?`<p><a href="${url}">View details</a></p>`:''}</div>`
  });
  event.delivered.email = true;
  event.deliveredAt = new Date();
  await event.save();
  return true;
}

function eventForSignedCustomer(event) {
  return {
    id: String(event._id),
    type: event.type,
    title: event.title,
    body: event.body,
    url: openText(event.urlEncrypted || ''),
    imageUrl: event.imageUrl || '',
    data: openJson(event.dataEncrypted || '', {}),
    readAt: event.readAt || null,
    delivered: event.delivered || {},
    deliveredAt: event.deliveredAt || null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

module.exports = { createEvent, sendEventEmail, eventForSignedCustomer };
