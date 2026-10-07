const fs = require('fs');
const path = require('path');

const root = process.cwd();
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function check(ok, message) {
  if (!ok) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
  } else console.log(`✓ ${message}`);
}

const app = read('src/app.js');
const webhooks = read('src/routes/shopifyWebhooks.js');
const routes = read('src/modules/workflows/workflows.routes.js');
const engine = read('src/modules/workflows/workflows.engine.js');
const models = read('src/modules/workflows/workflows.models.js');
const scheduler = read('src/modules/workflows/workflows.scheduler.js');
const bridge = read('src/modules/workflows/workflows.shopify.js');
const ui = read('public/modules/workflows/index.html');
const uiJs = read('public/modules/workflows/admin.js');

check(fs.existsSync(path.join(root, 'src/modules/workflows/workflows.shopify.js')), 'Shopify workflow bridge exists');
check(app.indexOf("app.use('/api/workflows', elev8Workflows.publicRouter)") < app.indexOf("app.use((req, res) => res.status(404)"), 'public workflow routes are mounted before 404');
check(webhooks.includes('ingestShopifyWebhookEvent'), 'verified Shopify webhooks feed ELEV8 Automations');
check(webhooks.includes("'/shopify/automation'"), 'generic automation webhook endpoint exists');
check(engine.includes('getAccessTokenForShop'), 'Shopify GraphQL uses ELEV8 per-shop OAuth token resolver');
check(models.includes('WorkflowEvent') && models.includes('WorkflowLease'), 'event dedupe and distributed lease models exist');
check(scheduler.includes('acquireLease') && scheduler.includes('WorkflowLease'), 'workflow worker uses distributed lease');
check(routes.includes("'/shopify/sync'") && routes.includes("'/shopify/index'") && routes.includes("'/shopify/status'"), 'admin setup/readiness endpoints exist');
check(!routes.includes('req.body?.bearerToken'), 'REST workflow tokens are not accepted in request bodies');
check(routes.includes('req.shopDomain'), 'workflow admin routes use authenticated shop context');
check(bridge.includes('indexRequiredSnapshots') && bridge.includes('syncAutomationWebhookSubscriptions'), 'snapshot indexing and webhook sync are implemented');
check(ui.includes('shopify-automation-setup') && uiJs.includes('loadShopifyStatus') && uiJs.includes('syncShopify') && uiJs.includes('indexShopify'), 'Automations UI exposes Shopify setup and readiness controls');

if (process.exitCode) process.exit(process.exitCode);
console.log('ELEV8 Workflows Shopify V2 smoke test passed.');
