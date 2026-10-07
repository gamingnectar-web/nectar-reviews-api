const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
function check(ok, msg) {
  if (!ok) { console.error(`✗ ${msg}`); process.exitCode = 1; }
  else console.log(`✓ ${msg}`);
}

const models = read('src/modules/workflows/workflows.models.js');
const shopify = read('src/modules/workflows/workflows.shopify.js');
const routes = read('src/modules/workflows/workflows.routes.js');
const html = read('public/modules/workflows/index.html');
const js = read('public/modules/workflows/admin.js');

check(fs.existsSync(path.join(root, 'src/modules/workflows/workflows.webhookRegistry.js')), 'webhook ownership registry exists');
check(fs.existsSync(path.join(root, 'src/modules/reviews/shopifyReviewPresence.js')), 'Shopify review presence audit exists');
check(models.includes('WorkflowWebhookStat'), 'webhook telemetry model exported');
check(shopify.includes('recordWebhookAccepted') && shopify.includes('recordWebhookDuplicate') && shopify.includes('recordWebhookFailure'), 'Shopify event ingestion records webhook telemetry');
check(routes.includes("'/shopify/webhooks'") && routes.includes("'/shopify/webhooks/adopt-companion'"), 'webhook registry endpoints are mounted');
check(routes.includes("'/shopify/review-presence'"), 'Shopify review presence endpoint is mounted');
check(html.includes('data-tab="webhooks"') && html.includes('data-panel="webhooks"'), 'Automations has a dedicated Webhooks tab');
check(js.includes('loadWebhookRegistry') && js.includes('adoptCompanionCoverage'), 'Webhooks tab loads telemetry and companion migration');
check(js.includes('loadReviewPresence'), 'Shopify review visibility is shown in the UI');
check(read('extensions/review-widget-extension/shopify.extension.toml').includes('ELEV8 Reviews'), 'theme app extension is visibly named ELEV8 Reviews');

if (process.exitCode) process.exit(process.exitCode);
console.log('ELEV8 Shopify ownership V3 smoke test passed.');
