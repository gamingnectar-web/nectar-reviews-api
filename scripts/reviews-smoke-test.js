'use strict';

/**
 * Reviews production smoke test.
 *
 * This intentionally avoids MongoDB, SMTP and Shopify network calls so it can run
 * during Render's build step. It validates the security-critical pure logic and
 * verifies that the live runtime wiring needed for the review automation remains
 * present in source.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function requireText(source, needle, label) {
  assert(
    source.includes(needle),
    `${label}: expected source to contain ${JSON.stringify(needle)}`
  );
}

function requireRegex(source, regex, label) {
  assert(regex.test(source), `${label}: expected source to match ${regex}`);
}

function check(label, fn) {
  try {
    fn();
    console.log(`✓ ${label}`);
  } catch (error) {
    console.error(`✗ ${label}`);
    throw error;
  }
}

// Give the token module a deterministic build-only signing secret. This does not
// alter production configuration; it exists only in this Node process.
if (!process.env.EMAIL_CREDENTIAL_SECRET) {
  process.env.EMAIL_CREDENTIAL_SECRET = 'reviews-smoke-test-secret-not-for-production';
}

check('signed review tokens are created and verify for the correct shop/order/product', () => {
  const { createReviewToken, verifyReviewToken } = require('../src/utils/reviewTokens');

  const token = createReviewToken({
    shopDomain: 'gamingnectar.myshopify.com',
    email: 'customer@example.com',
    orderId: 'ORDER-1001',
    products: [
      { productId: 'gid://shopify/Product/1234567890', variantId: 'gid://shopify/ProductVariant/9876543210', title: 'Test Product' },
    ],
  });

  assert(token && token.startsWith('rv1.'), 'Expected an rv1 signed token.');

  const verified = verifyReviewToken(token, {
    shopDomain: 'gamingnectar.myshopify.com',
    email: 'customer@example.com',
    orderId: 'ORDER-1001',
    itemId: '1234567890',
  });
  assert.strictEqual(verified.ok, true, verified.error || 'Expected token to verify.');
});

check('signed review tokens reject a different product', () => {
  const { createReviewToken, verifyReviewToken } = require('../src/utils/reviewTokens');
  const token = createReviewToken({
    shopDomain: 'gamingnectar.myshopify.com',
    email: 'customer@example.com',
    orderId: 'ORDER-1002',
    products: [{ productId: '1234567890', title: 'Test Product' }],
  });
  const verified = verifyReviewToken(token, {
    shopDomain: 'gamingnectar.myshopify.com',
    email: 'customer@example.com',
    orderId: 'ORDER-1002',
    itemId: '7777777777',
  });
  assert.strictEqual(verified.ok, false, 'Token must not validate another product.');
});

check('signed review tokens reject a different shop', () => {
  const { createReviewToken, verifyReviewToken } = require('../src/utils/reviewTokens');
  const token = createReviewToken({
    shopDomain: 'gamingnectar.myshopify.com',
    email: 'customer@example.com',
    orderId: 'ORDER-1003',
    products: [{ productId: '1234567890', title: 'Test Product' }],
  });
  const verified = verifyReviewToken(token, {
    shopDomain: 'another-store.myshopify.com',
    email: 'customer@example.com',
    orderId: 'ORDER-1003',
    itemId: '1234567890',
  });
  assert.strictEqual(verified.ok, false, 'Token must be shop-bound.');
});

check('review submission keeps one-use and duplicate-review protection', () => {
  const source = read('src/routes/public.js');
  requireText(source, 'reviewTokenUsedAt', 'One-use review token');
  requireText(source, 'hashValue(reviewToken)', 'One-use review token hashing');
  requireText(source, 'This review link has already been used.', 'One-use rejection');
  requireText(source, 'You have already reviewed this product.', 'Duplicate product review rejection');
  requireText(source, 'alreadyReviewedProductIds', 'Duplicate bulk review protection');
});

check('test submissions cannot become verified purchases', () => {
  const source = read('src/routes/public.js');
  requireRegex(source, /if \(!token \|\| isTest\)/, 'Test verification guard');
  requireText(source, 'Test review; never verified or published', 'Test review verification note');
  requireText(source, 'Signed test link; never verified or published', 'Signed test verification note');
});

check('public review queries filter to accepted, non-deleted, non-test reviews', () => {
  const source = read('src/routes/public.js');
  requireText(source, "status: 'accepted'", 'Accepted-only public review filter');
  requireText(source, 'isDeleted: false', 'Deleted review filter');
  requireText(source, "isTestReview: { $ne: true }", 'Test review filter');
  requireText(source, "testMode: { $ne: true }", 'Test mode filter');
});

check('Shopify review webhooks fail closed on invalid HMAC', () => {
  const source = read('src/routes/shopifyWebhooks.js');
  requireText(source, "crypto.createHmac('sha256', env.shopifyApiSecret)", 'Webhook HMAC calculation');
  requireText(source, "req.headers['x-shopify-hmac-sha256']", 'Shopify HMAC header');
  requireText(source, "res.status(401).json({ error: 'Invalid Shopify webhook signature.' })", 'Invalid HMAC rejection');
  requireText(source, "express.raw({ type: '*/*'", 'Raw webhook body');
});

check('webhooks are mounted before JSON parsing so HMAC receives the raw body', () => {
  const source = read('src/app.js');
  const webhookMount = source.indexOf("app.use('/api/webhooks', shopifyWebhookRoutes)");
  const jsonParser = source.indexOf('app.use(express.json(');
  assert(webhookMount >= 0, 'Webhook route mount missing.');
  assert(jsonParser >= 0, 'JSON parser missing.');
  assert(webhookMount < jsonParser, 'Webhook route must be mounted before express.json().');
});

check('fulfilled and updated order webhooks feed review automation', () => {
  const source = read('src/routes/shopifyWebhooks.js');
  requireText(source, 'scheduleReviewRequestFromOrder', 'Fulfilment scheduling');
  requireText(source, 'updateReviewRequestDeliveryFromOrder', 'Delivery update scheduling');
  requireText(source, "topic: 'orders/fulfilled'", 'Fulfilled webhook topic');
  requireText(source, "topic: 'orders/updated'", 'Updated webhook topic');
});

check('review automation requires delivery gating and supports delayed sends', () => {
  const source = read('src/modules/reviews/reviewRequestAutomation.js');
  requireText(source, 'deliveryTagRequired', 'Delivery-tag configuration');
  requireText(source, "deliveryAnchor: ['fulfilled_at', 'delivered_tag']", 'Delivery anchor validation');
  requireText(source, 'awaiting_delivery', 'Awaiting-delivery state');
  requireText(source, 'scheduledAt', 'Scheduled send time');
  requireText(source, 'sendDueReviewRequests', 'Due send processor');
});

check('review scheduler starts automatically and repeatedly processes due jobs', () => {
  const reviews = read('src/modules/reviews/reviewRequestAutomation.js');
  const modules = read('src/modules/index.js');
  const server = read('server.js');
  requireText(reviews, 'function startReviewRequestJobs()', 'Review scheduler entrypoint');
  requireText(reviews, 'setInterval(run, 10 * 60 * 1000)', 'Review scheduler recurring interval');
  requireText(modules, 'startReviewRequestJobs();', 'Platform module scheduler startup');
  requireText(server, 'startPlatformModuleJobs();', 'Server module scheduler startup');
});

check('review sends require active encrypted SMTP credentials', () => {
  const source = read('src/modules/reviews/reviewRequestAutomation.js');
  requireText(source, '!settings.enabled || !settings.smtpPassEncrypted', 'SMTP credential guard');
  requireText(source, 'No active email provider with saved SMTP/app-password credentials is configured.', 'SMTP failure message');
  requireText(source, 'await transporter.sendMail({', 'SMTP send path');
});

check('readiness checks cover scheduler, delivery gate, sender, signed links and Shopify OAuth', () => {
  const source = read('src/modules/reviews/reviewRequestAutomation.js');
  for (const key of ['native_scheduler', 'delivery_tag_gate', 'email_provider', 'signed_links', 'shopify_oauth']) {
    requireText(source, `key: '${key}'`, `Readiness check ${key}`);
  }
});

check('review database schema retains token-use and automation fields', () => {
  const source = read('src/models/index.js');
  requireText(source, 'reviewTokenUsedAt', 'Used-token schema field');
  requireText(source, 'reviewAutomation:', 'Review automation settings schema');
  requireText(source, 'deliveryTagRequired:', 'Delivery gate settings schema');
  requireText(source, 'delayDays:', 'Delay settings schema');
});


check('launch checklist simple portal defines outstanding-send state before rendering', () => {
  const source = read('public/reviews-launch-checklist.js');
  requireText(source, "const outstanding = data.outstanding ||", 'Outstanding snapshot declaration');
  requireText(source, "const outstandingActionable =", 'Outstanding actionable declaration');
  requireText(source, "const outstandingLabel =", 'Outstanding label declaration');
  requireText(source, 'restoreTechnicalPanels();', 'Checklist render fallback');
  const renderStart = source.indexOf('function renderSimplePortal');
  const labelDecl = source.indexOf('const outstandingLabel =', renderStart);
  const labelUse = source.indexOf('${esc(outstandingLabel)}', renderStart);
  assert(labelDecl >= 0 && labelUse >= 0 && labelDecl < labelUse, 'Outstanding label must be declared before it is rendered.');
});

check('signed proof links take precedence over local test-mode query fallback', () => {
  const source = read('Shopify-Liquid/assets/nectar-review-page.js');
  requireText(source, "const signedToken = params.get('token') || params.get('reviewToken') || '';", 'Signed proof token lookup');
  requireText(source, "if (!signedToken && (params.get('test') === '1' || queryProducts.length))", 'Signed-token precedence');
  requireText(source, "params.get('order_id')", 'order_id compatibility');
  const extension = read('extensions/review-widget-extension/assets/nectar-review-page.js');
  requireText(extension, "if (!signedToken && (params.get('test') === '1' || queryProducts.length))", 'Extension signed-token precedence');
});

check('magic-link API validates supplied signed proof tokens and accepts order_id aliases', () => {
  const source = read('src/routes/public.js');
  requireText(source, "req.query.orderId || req.query.order_id || req.query.order", 'Magic-link order_id alias');
  requireRegex(source, /if \(reviewToken\)[\s\S]*?if \(verified\.ok\)[\s\S]*?else \{\s*return res\.status\(400\)/, 'Invalid supplied token fails closed');
});

check('review email renderer supports Nectar and legacy customer first-name variables', () => {
  const source = read('src/modules/reviews/reviewRequestAutomation.js');
  requireText(source, "const firstName = String(customerName).trim().split(/\\s+/)[0] || 'there';", 'Customer first-name derivation');
  requireText(source, 'order\\.customer\\.firstName', 'Legacy firstName template compatibility');
  requireText(source, 'customerFirstName', 'Nectar first-name template variable');
  const builder = read('public/admin-messaging-campaigns.js');
  requireText(builder, 'Hi {{ customerName }}', 'Email-builder Nectar variable default');
});

console.log('\nReviews smoke test passed: security and automation wiring look production-ready at build time.');
