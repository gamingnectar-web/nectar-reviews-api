const fs = require('fs');
const assert = require('assert');
function read(path) { return fs.readFileSync(path, 'utf8'); }
const security = read('src/utils/security.js');
const auth = read('src/routes/auth.js');
const app = read('src/app.js');
const submit = read('src/utils/reviewSubmissionSecurity.js');

const checks = [
  ['admin token is not accepted from query strings', !security.includes('req.query.admin_token')],
  ['admin shared secret is not accepted from query strings', !security.includes('req.query.admin_secret')],
  ['admin CORS does not trust every myshopify origin', !security.includes("origin.endsWith('.myshopify.com')")],
  ['cookie admin writes require a trusted Origin', security.includes('requireTrustedCookieOrigin')],
  ['HSTS is enabled in production', security.includes('Strict-Transport-Security')],
  ['OAuth callback does not put admin token in redirect URL', !auth.includes('admin_token=')],
  ['OAuth token exchange errors do not log response payload', !auth.includes("console.error('Shopify token exchange failed:', tokenJson")],
  ['public DB health does not expose database names', !app.includes('database: mongoose.connection.name')],
  ['review submission payload cap is active', submit.includes('96 * 1024')],
  ['review score keys are constrained', submit.includes('Unexpected review attribute')],
  ['review score values are range checked', submit.includes('numeric < 0 || numeric > 100')],
  ['concurrent duplicate review guard is active', submit.includes('review_submission_guards') && submit.includes('error?.code === 11000')],
];
let passed = 0;
for (const [name, ok] of checks) {
  assert.ok(ok, name);
  passed += 1;
  console.log(`✓ ${name}`);
}
console.log(`Security smoke passed: ${passed} checks`);
