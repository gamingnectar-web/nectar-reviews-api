const express = require('express');
const { getProgram, getCustomerState, reserveRedemption } = require('../modules/loyalty/loyalty.service');
const { cleanShopDomain, cleanText } = require('../utils/validation');
const router = express.Router();
function shop(req){ return cleanShopDomain(req.query.shopDomain || req.body?.shopDomain || ''); }
router.get('/config', async (req, res, next) => { try { const program = await getProgram(shop(req)); res.json({ ok: true, enabled: Boolean(program.enabled && program.checkoutBeta?.enabled), program }); } catch(e){ next(e); } });
router.post('/wallet', async (req, res, next) => { try { res.json({ ok: true, state: await getCustomerState(shop(req), cleanText(req.body.customerRef, 240)) }); } catch(e){ next(e); } });
router.post('/redeem', async (req, res, next) => { try { res.json({ ok: true, redemption: await reserveRedemption(shop(req), req.body || {}) }); } catch(e){ next(e); } });
module.exports = router;
