function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const appUrl = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  // Neutral env names first for white-label/multi-product deployments.
  // Legacy names are kept so existing Render services do not break.
  mongoUri: process.env.CORE_DB_URI || process.env.MONGODB_URI || process.env.MONGO_URI || '',
  loyaltyMongoUri: process.env.LOYALTY_DB_URI || process.env.LOYALTY_MONGODB_URI || '',
  appUrl,
  shopifyApiKey: process.env.SHOPIFY_API_KEY || '',
  shopifyApiSecret: process.env.SHOPIFY_API_SECRET || '',
  shopifyStoreUrl: (process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_SHOP_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase(),
  shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION || '2026-07',
  shopifyScopes: process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_customers,read_orders,read_discounts,write_discounts,read_price_rules,write_price_rules,write_metaobject_definitions,write_metaobjects',
  emailCredentialSecret: process.env.EMAIL_CREDENTIAL_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET || '',
  adminSharedSecret: process.env.ADMIN_SHARED_SECRET || '',
  allowUnauthenticatedAdmin: bool(process.env.ALLOW_UNAUTHENTICATED_ADMIN, false),
  allowedAdminOrigins: csv(process.env.ALLOWED_ADMIN_ORIGINS || `${appUrl},https://admin.shopify.com`),
  jsonLimit: process.env.JSON_LIMIT || '1mb',
};

module.exports = { env, bool, csv };
