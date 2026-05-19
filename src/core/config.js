function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function intEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

const config = {
  port: intEnv('PORT', 3000),
  appBaseUrl: (process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || '').replace(/\/$/, ''),
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || '',
  auditMongoUri: process.env.MONGODB_AUDIT_URI || '',
  auditDbName: process.env.MONGODB_AUDIT_DB || 'nectar_audit',
  security: {
    nodeEnv: process.env.NODE_ENV || 'development',
    adminApiSecret: process.env.ADMIN_API_SECRET || '',
    adminAuthMode: process.env.ADMIN_AUTH_MODE || 'shared_secret',
    customerIdSecret: process.env.CUSTOMER_ID_SECRET || process.env.SESSION_SECRET || process.env.SHOPIFY_API_SECRET || '',
    auditHashSecret: process.env.AUDIT_HASH_SECRET || process.env.CUSTOMER_ID_SECRET || process.env.SESSION_SECRET || process.env.SHOPIFY_API_SECRET || '',
    allowInsecureCustomerLookup: boolEnv('ALLOW_INSECURE_CUSTOMER_LOOKUP', false),
    corsOrigin: process.env.CORS_ORIGIN || '',
    rateLimitWindowMs: intEnv('RATE_LIMIT_WINDOW_MS', 60000),
    rateLimitMax: intEnv('RATE_LIMIT_MAX', 120),
    cronSecret: process.env.CRON_SECRET || '',
    maxJsonSize: process.env.MAX_JSON_SIZE || '2mb'
  },
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY || '',
    apiSecret: process.env.SHOPIFY_API_SECRET || '',
    scopes: process.env.SHOPIFY_SCOPES || 'read_products,read_orders,write_products,write_discounts',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2025-10',
    storeUrl: process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_SHOP_DOMAIN || '',
    adminAccessToken: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ''
  },
  modules: {
    reviews: boolEnv('MODULE_REVIEWS', true),
    messaging: boolEnv('MODULE_MESSAGING', true),
    discounts: boolEnv('MODULE_DISCOUNTS', false),
    loyalty: boolEnv('MODULE_LOYALTY', false),
    help: boolEnv('MODULE_HELP', true),
    audit: boolEnv('MODULE_AUDIT', true)
  },
  loyalty: {
    defaultApprovalDays: intEnv('LOYALTY_DEFAULT_APPROVAL_DAYS', 14),
    pendingBatchSize: intEnv('LOYALTY_PENDING_BATCH_SIZE', 100)
  }
};

module.exports = { config, boolEnv, intEnv };
