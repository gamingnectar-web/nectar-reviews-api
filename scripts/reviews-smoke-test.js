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

check('delivery monitor uses Shopify fulfilment delivery events and requires every active parcel to be delivered', () => {
  const source = read('src/modules/reviews/reviewRequestAutomation.js');
  requireText(source, 'fetchShopifyDeliveryStatus', 'Delivery monitor query');
  requireText(source, 'deliveredAt', 'Shopify deliveredAt signal');
  requireText(source, "displayStatus", 'Shopify fulfilment display status');
  requireText(source, "event?.status", 'Shopify delivery event status');
  requireText(source, 'deliveredFulfillments.length === active.length', 'All-parcels delivered gate');
  requireText(source, "source: allCarrierDelivered ? 'shopify_fulfillment_delivery'", 'Carrier delivery source');
});

check('delivery monitor reconciles awaiting jobs before the email sender runs', () => {
  const source = read('src/modules/reviews/reviewRequestAutomation.js');
  requireText(source, 'async function reconcileAwaitingDeliveryJobs', 'Awaiting-delivery reconciliation');
  const scheduler = source.indexOf('function startReviewRequestJobs()');
  const reconcile = source.indexOf('await reconcileAwaitingDeliveryJobs({ limit: 25 });', scheduler);
  const send = source.indexOf('await sendDueReviewRequests({ limit: 25 });', scheduler);
  assert(reconcile >= 0 && send >= 0 && reconcile < send, 'Delivery reconciliation must run before due review emails are sent.');
});

check('review jobs persist delivery diagnostics for launch visibility', () => {
  const source = read('src/models/index.js');
  for (const field of ['lastDeliveryCheckAt:', 'deliveryStatus:', 'deliverySource:', 'deliveryTracking:']) {
    requireText(source, field, `Delivery diagnostic field ${field}`);
  }
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

check('old-order cutoff config is modelled', () => {
  const source = read('src/models/index.js');
  requireText(source, 'orderCutoffDate:', 'Order cutoff date setting');
  requireText(source, 'maxOrderAgeDays:', 'Maximum order age setting');
  requireText(source, 'orderCreatedAt:', 'Order creation timestamp on review jobs');
});

check('old-order eligibility is enforced before customer send', () => {
  const source = read('src/modules/reviews/reviewRequestAutomation.js');
  requireText(source, 'function reviewRequestEligibility', 'Order eligibility helper');
  requireText(source, "job.status = 'skipped';", 'Pre-send skipped state');
  requireText(source, 'Review request skipped: order is older than', 'Maximum age block reason');
  requireText(source, 'Review request skipped: order was placed before the configured cutoff date', 'Cutoff date block reason');
});

check('launch portal exposes old-order safety controls', () => {
  const source = read('public/reviews-launch-checklist.js');
  requireText(source, 'review-order-cutoff-date', 'Cutoff date control');
  requireText(source, 'review-max-order-age-days', 'Maximum age control');
  requireText(source, 'saveReviewOrderSafety', 'Safety save action');
});


check('review product context schema retains image tags metafields and resolved sliders', () => {
  const source = read('src/models/index.js');
  for (const field of ['image:', 'vendor:', 'productType:', 'tags:', 'metafields:', 'matchingSliders:']) requireText(source, field, `Review request product ${field}`);
});

check('Drink tag resolves the configured review sliders', () => {
  const { matchingReviewSliders } = require('../src/modules/reviews/reviewProductContext');
  const rules = [
    { type: 'tag', condition: 'Drink', label: 'Sourness' },
    { type: 'tag', condition: 'Drink', label: 'Sweetness' },
    { type: 'tag', condition: 'Drink', label: 'Flavour' },
  ];
  const matched = matchingReviewSliders({ productId: '1234567890', tags: ['Drink', 'Energy'] }, rules);
  assert.deepStrictEqual(matched.map((item) => item.label), ['Sourness', 'Sweetness', 'Flavour']);
});

check('unmatched tag does not leak conditional sliders', () => {
  const { matchingReviewSliders } = require('../src/modules/reviews/reviewProductContext');
  const matched = matchingReviewSliders({ productId: '1234567890', tags: ['Powder'] }, [{ type: 'tag', condition: 'Drink', label: 'Sourness' }]);
  assert.strictEqual(matched.length, 0);
});

check('metafield rules match actual namespaced product metafields', () => {
  const { matchingReviewSliders } = require('../src/modules/reviews/reviewProductContext');
  const product = { metafields: [{ namespace: 'core', key: 'review_profile', value: 'drink' }] };
  assert.strictEqual(matchingReviewSliders(product, [{ type: 'metafield', condition: 'core.review_profile', label: 'Mixability' }]).length, 1);
});

check('signed review tokens retain customer-facing product context', () => {
  const { createReviewToken, verifyReviewToken } = require('../src/utils/reviewTokens');
  const token = createReviewToken({ shopDomain: 'gamingnectar.myshopify.com', email: 'customer@example.com', orderId: 'ORDER-CONTEXT', products: [{ productId: '1234567890', title: 'Drink', image: 'https://cdn.example.com/p.png', tags: ['Drink'], metafields: [{ namespace: 'core', key: 'review_profile', value: 'drink' }], matchingSliders: [{ type: 'tag', condition: 'Drink', label: 'Sourness' }] }] });
  const verified = verifyReviewToken(token, { shopDomain: 'gamingnectar.myshopify.com', email: 'customer@example.com', orderId: 'ORDER-CONTEXT' });
  assert.strictEqual(verified.ok, true);
  assert.strictEqual(verified.payload.products[0].image, 'https://cdn.example.com/p.png');
  assert.deepStrictEqual(verified.payload.products[0].tags, ['Drink']);
  assert.strictEqual(verified.payload.products[0].matchingSliders[0].label, 'Sourness');
});

check('storefront magic-link request canonicalises shopDomain instead of duplicating it', () => {
  const source = read('Shopify-Liquid/assets/nectar-review-page.js');
  requireText(source, "magicParams.set('shopDomain', SHOP_DOMAIN)", 'Canonical magic-link shop');
  requireText(source, "magicParams.delete('shop')", 'Remove alternate shop parameter');
  assert(!source.includes('magic-link/order?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&${params.toString()}'), 'Old duplicate shopDomain builder must be removed.');
});

check('proof flow preserves real order identity and refreshed product context', () => {
  const source = read('src/routes/admin.js');
  requireText(source, 'const products = await buildProofProducts', 'Proof refreshes source products');
  requireText(source, 'refreshReviewJobProductsFromShopify(shopDomain, sourceJob, settings)', 'Proof re-fetches canonical Shopify order context');
  requireText(source, 'orderId: sourceJob.orderId', 'Proof keeps real order ID');
  requireText(source, 'products,', 'Proof job receives enriched products');
});

check('saving old-order safety immediately reconciles existing unsent jobs', () => {
  const source = read('src/routes/admin.js');
  requireText(source, 'reconciledSkipped', 'Safety reconciliation result');
  requireText(source, "status: { $in: ['awaiting_delivery', 'scheduled', 'failed', 'blocked'] }", 'Queued-job safety reconciliation');
});


check('proofs use a real non-test order source and never fall back to fabricated products', () => {
  const source = read('src/routes/admin.js');
  requireText(source, "source: { $ne: 'admin_shop_email_order_proof' }", 'Proof source excludes prior proofs');
  assert(!source.includes("'products.0': { $exists: true }"), 'Proof source must not depend on stale stored product arrays.');
  requireText(source, 'No real Shopify review-request job is available for a proof yet.', 'No fake fallback');
  requireText(source, 'const products = await buildProofProducts', 'Proof products are refreshed');
  requireText(source, "orderId: sourceJob.orderId", 'Proof retains real order identity');
  requireText(source, 'customerName: maskProofName', 'Proof masks customer display');
  requireText(source, 'testMode: true', 'Proof remains test-only');
});

check('proof send refuses empty/unmatched product context and reports enrichment diagnostics', () => {
  const source = read('src/routes/admin.js');
  const automation = read('src/modules/reviews/reviewRequestAutomation.js');
  requireText(automation, 'Shopify returned this order without any reviewable line items. Review email was not sent.', 'Empty canonical order refusal');
  requireText(automation, 'Shopify order products could not be resolved to valid product IDs. Review email was not sent.', 'Unmatched Shopify proof refusal');
  for (const key of ['productCount', 'withImages', 'withTags', 'sliderRuleCount']) requireText(source, key, `Proof diagnostic ${key}`);
});

check('storefront product normaliser has one authoritative metafield/slider assignment', () => {
  const source = read('Shopify-Liquid/assets/nectar-review-page.js');
  const body = source.slice(source.indexOf('function normaliseProduct'), source.indexOf('function uniqueProducts'));
  assert.strictEqual((body.match(/metafields:/g) || []).length, 1, 'normaliseProduct should assign metafields once.');
  assert.strictEqual((body.match(/matchingSliders:/g) || []).length, 1, 'normaliseProduct should assign matchingSliders once.');
});


check('Mongoose review-product subdocuments are converted to plain objects before enrichment', () => {
  const source = read('src/modules/reviews/reviewRequestAutomation.js');
  requireText(source, "typeof product.toObject === 'function'", 'Mongoose subdocument detection');
  requireText(source, 'return product.toObject({ depopulate: true, getters: false, virtuals: false });', 'Mongoose product conversion');
  requireText(source, 'map(plainReviewProduct)', 'Product enrichment plain-object boundary');
});

check('proof and live send paths re-fetch canonical Shopify order context', () => {
  const automation = read('src/modules/reviews/reviewRequestAutomation.js');
  const admin = read('src/routes/admin.js');
  requireText(automation, 'fetchShopifyOrderForReviewJob', 'Canonical Shopify order loader');
  requireText(automation, '/orders/${orderId}.json', 'Direct Shopify order endpoint');
  requireText(automation, 'refreshReviewJobProductsFromShopify', 'Review job product refresh');
  requireText(automation, 'if (!job.testMode)', 'Live-send canonical refresh');
  requireText(admin, 'refreshReviewJobProductsFromShopify(shopDomain, sourceJob, settings)', 'Proof canonical refresh');
});

check('review sends fail closed when canonical Shopify order has no usable products', () => {
  const automation = read('src/modules/reviews/reviewRequestAutomation.js');
  requireText(automation, 'Shopify returned this order without any reviewable line items. Review email was not sent.', 'Missing line-item send guard');
  requireText(automation, 'Shopify order products could not be resolved to valid product IDs. Review email was not sent.', 'Missing product-context send guard');
});

console.log('\nReviews smoke test passed: security and automation wiring look production-ready at build time.');
