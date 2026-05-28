const express = require('express');
const { listRules, saveRule } = require('./discounts.service');
const router = express.Router();
router.get('/', async (req,res,next)=>{ try{ res.json({ ok:true, rules: await listRules(req.shopDomain) }); }catch(e){ next(e); } });
router.post('/', async (req,res,next)=>{ try{ res.json({ ok:true, rule: await saveRule(req.shopDomain, req.body || {}) }); }catch(e){ next(e); } });
module.exports = router;
