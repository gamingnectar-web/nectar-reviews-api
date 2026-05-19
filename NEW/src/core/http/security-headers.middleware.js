function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.shopify.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.myshopify.com https://admin.shopify.com; frame-ancestors https://*.myshopify.com https://admin.shopify.com;");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Do not set X-Frame-Options. Shopify embedded apps need to render inside Shopify Admin,
  // and CSP frame-ancestors above is the modern, allow-list based protection.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}

module.exports = { securityHeaders };
