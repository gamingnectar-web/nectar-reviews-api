const express = require('express');
const { cleanShopDomain, isValidShopDomain } = require('../utils/validation');
const {
  getOrCreateConfig,
  publicStorefrontConfig,
  getSubscriptionStatus,
  subscribeRestock,
  unsubscribeRestock,
  adminSummary,
  listSubscriptions,
  listEvents,
  listRestockDemand,
  buildFlowTemplate,
  getAdminConfig,
  updateAdminConfig,
  registerInventoryWebhook,
  inspectInventoryWebhook,
  sendTestEmail,
} = require('../modules/notifications/notifications.service');

const publicRouter = express.Router();
const adminRouter = express.Router();

function publicShop(req) {
  const shopDomain = cleanShopDomain(req.query.shopDomain || req.body?.shopDomain || req.headers['x-shop-domain'] || '');
  if (!shopDomain || !isValidShopDomain(shopDomain)) return '';
  return shopDomain;
}

publicRouter.get('/config', async (req, res, next) => {
  try {
    const shopDomain = publicShop(req);
    if (!shopDomain) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    const config = await getOrCreateConfig(shopDomain);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json(publicStorefrontConfig(config));
  } catch (error) { next(error); }
});

publicRouter.post('/restock/status', async (req, res, next) => {
  try {
    const shopDomain = publicShop(req);
    if (!shopDomain) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await getSubscriptionStatus({ shopDomain, email: req.body.email, variantId: req.body.variantId }));
  } catch (error) { next(error); }
});

publicRouter.post('/restock/subscribe', async (req, res, next) => {
  try {
    const shopDomain = publicShop(req);
    if (!shopDomain) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await subscribeRestock({ ...req.body, shopDomain }));
  } catch (error) { next(error); }
});

publicRouter.post('/restock/unsubscribe', async (req, res, next) => {
  try {
    const shopDomain = publicShop(req);
    if (!shopDomain) return res.status(400).json({ error: 'Valid shopDomain is required.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await unsubscribeRestock({ shopDomain, email: req.body.email, variantId: req.body.variantId }));
  } catch (error) { next(error); }
});

adminRouter.get('/summary', async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); return res.json(await adminSummary(req.shopDomain)); }
  catch (error) { next(error); }
});

adminRouter.get('/subscriptions', async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); return res.json(await listSubscriptions(req.shopDomain, req.query)); }
  catch (error) { next(error); }
});

adminRouter.get('/events', async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); return res.json(await listEvents(req.shopDomain, req.query.limit)); }
  catch (error) { next(error); }
});

adminRouter.get('/demand', async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); return res.json(await listRestockDemand(req.shopDomain)); }
  catch (error) { next(error); }
});

adminRouter.get('/flow-template', async (req, res, next) => {
  try { const config = await getOrCreateConfig(req.shopDomain); res.setHeader('Cache-Control', 'no-store'); return res.json(buildFlowTemplate(config, req.shopDomain)); }
  catch (error) { next(error); }
});

adminRouter.get('/config', async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); return res.json(await getAdminConfig(req.shopDomain)); }
  catch (error) { next(error); }
});

adminRouter.put('/config', async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); return res.json(await updateAdminConfig(req.shopDomain, req.body || {})); }
  catch (error) { next(error); }
});

adminRouter.get('/webhook', async (req, res, next) => {
  try { return res.json(await inspectInventoryWebhook(req.shopDomain)); }
  catch (error) { next(error); }
});

adminRouter.post('/webhook/register', async (req, res, next) => {
  try { return res.json(await registerInventoryWebhook(req.shopDomain)); }
  catch (error) { next(error); }
});

adminRouter.post('/test-email', async (req, res, next) => {
  try { return res.json(await sendTestEmail(req.shopDomain, req.body?.email)); }
  catch (error) { next(error); }
});

module.exports = { publicRouter, adminRouter };
