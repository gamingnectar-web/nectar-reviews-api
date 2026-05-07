/*
  Nectar Reviews — test email endpoint addon

  Install notes:
  1. Add nodemailer to package.json:
     "nodemailer": "^6.9.16"

  2. Add near the top of server.js:
     const nodemailer = require('nodemailer');

  3. Add this route before app.listen(...).

  Required env vars for real sending:
  SMTP_HOST=smtp.your-provider.com
  SMTP_PORT=587
  SMTP_USER=your-user
  SMTP_PASS=your-password
  SMTP_FROM="Nectar Reviews <reviews@yourdomain.com>"

  Without SMTP vars, the endpoint returns 500 and the admin UI falls back to opening a mail draft.
*/

app.post('/api/admin/test-email', async (req, res) => {
  try {
    const { to, subject, html } = req.body || {};

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
      return res.status(400).json({ error: 'A valid recipient email is required.' });
    }

    if (!html) {
      return res.status(400).json({ error: 'Email HTML is required.' });
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;

    if (!host || !user || !pass || !from) {
      return res.status(500).json({
        error: 'SMTP is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM.'
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from,
      to,
      subject: subject || 'Review request test email',
      html
    });

    res.json({ ok: true, message: 'Test email sent.' });
  } catch (error) {
    console.error('Test email send failed:', error);
    res.status(500).json({ error: 'Failed to send test email.' });
  }
});
