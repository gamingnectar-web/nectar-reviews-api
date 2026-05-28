const express = require('express');
const crypto = require('crypto');
const { env } = require('../config/env');
const { Shop } = require('../models');
const router = express.Router();
router.use(express.raw({ type: '*/*', limit: '5mb' }));
function verify(req) {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  if (!hmac || !env.shopifyApiSecret) return true;
  const digest = crypto.createHmac('sha256', env.shopifyApiSecret).update(req.body).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}
router.post('/', async (req, res, next) => {
  try {
    if (!verify(req)) return res.status(401).send('Invalid webhook HMAC');
    const topic = req.get('X-Shopify-Topic') || '';
    const shopDomain = req.get('X-Shopify-Shop-Domain') || '';
    if (topic === 'app/uninstalled' && shopDomain) await Shop.findOneAndUpdate({ shopDomain }, { $set: { uninstalledAt: new Date(), accessToken: '', accessTokenEncrypted: '' } });
    res.status(200).send('ok');
  } catch (e) { next(e); }
});
module.exports = router;
