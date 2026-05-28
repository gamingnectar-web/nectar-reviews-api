function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
  mongoUri: process.env.CORE_DB_URI || process.env.MONGODB_URI || '',
  loyaltyMongoUri: process.env.LOYALTY_DB_URI || process.env.LOYALTY_MONGODB_URI || '',
  shopifyApiKey: process.env.SHOPIFY_API_KEY || '',
  shopifyApiSecret: process.env.SHOPIFY_API_SECRET || '',
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION || '2026-07',
  shopifyScopes: process.env.SHOPIFY_SCOPES || 'read_products,write_products',
  emailCredentialSecret: process.env.EMAIL_CREDENTIAL_SECRET || process.env.REVIEW_TOKEN_SECRET || 'dev-secret-change-me',
  reviewTokenSecret: process.env.REVIEW_TOKEN_SECRET || process.env.EMAIL_CREDENTIAL_SECRET || 'dev-token-secret-change-me',
  adminSharedSecret: process.env.ADMIN_SHARED_SECRET || '',
  allowUnauthenticatedAdmin: bool(process.env.ALLOW_UNAUTHENTICATED_ADMIN, false),
  jsonLimit: process.env.JSON_LIMIT || '15mb',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModuleModel: process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini',
};

module.exports = { env };
