function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function list(value, fallback = []) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appUrl: (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  coreDbUri: process.env.CORE_DB_URI || process.env.MONGODB_URI || '',

  shopifyApiKey: process.env.SHOPIFY_API_KEY || '',
  shopifyApiSecret: process.env.SHOPIFY_API_SECRET || '',
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION || '2026-07',
  shopifyScopes: process.env.SHOPIFY_SCOPES || 'read_products,write_products',

  tokenSigningSecret: process.env.TOKEN_SIGNING_SECRET || process.env.EMAIL_CREDENTIAL_SECRET || 'dev-token-secret-change-me',
  adminSharedSecret: process.env.ADMIN_SHARED_SECRET || '',
  allowUnauthenticatedAdmin: bool(process.env.ALLOW_UNAUTHENTICATED_ADMIN, false),
  defaultEnabledModules: list(process.env.DEFAULT_ENABLED_MODULES, ['reviews', 'help']),
  brandName: process.env.NECTAR_BRAND_NAME || 'Nectar'
};

module.exports = { env, bool, list };
