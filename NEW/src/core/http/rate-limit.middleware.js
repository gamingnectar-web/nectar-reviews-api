const buckets = new Map();
const { config } = require('../config');

function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs || config.security.rateLimitWindowMs || 60000);
  const max = Number(options.max || config.security.rateLimitMax || 120);
  const keyPrefix = options.keyPrefix || 'global';

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}:${req.path}`;
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    buckets.set(key, bucket);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

module.exports = { createRateLimiter };
