const routes = require('./discounts.routes');
function mount(app, { makeRateLimiter, requireAdminSession } = {}) { app.use('/api/admin/discounts', makeRateLimiter ? makeRateLimiter({ windowMs: 60000, max: 80, keyPrefix: 'discounts' }) : (req,res,next)=>next(), requireAdminSession || ((req,res,next)=>next()), routes); }
module.exports = { mount };
