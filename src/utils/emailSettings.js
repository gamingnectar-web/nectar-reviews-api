const nodemailer = require('nodemailer');
async function createTransport(settings = {}) {
  if (settings?.smtpHost) {
    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort || 587),
      secure: Number(settings.smtpPort) === 465,
      auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass || '' } : undefined,
    });
  }
  return nodemailer.createTransport({ jsonTransport: true });
}
module.exports = { createTransport };
