const express = require('express');
const { startReviewRequestAutomation } = require('./reviewRequestAutomation');
let started = false;
function mount(app, { makeRateLimiter } = {}) {
  const router = express.Router();
  router.get('/status', (req, res) => res.json({ ok: true, module: 'reviews', live: true }));
  app.use('/api/modules/reviews', makeRateLimiter ? makeRateLimiter({ windowMs: 60000, max: 60, keyPrefix: 'mod-reviews' }) : (req,res,next)=>next(), router);
  if (!started) { started = true; startReviewRequestAutomation(); }
}
module.exports = { mount };
