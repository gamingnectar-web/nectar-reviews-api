const fs=require('fs'),assert=require('assert');
const modules=fs.readFileSync('src/modules/index.js','utf8');
const routes=fs.readFileSync('src/modules/settings-center/settingsCenter.routes.js','utf8');
const js=fs.readFileSync('public/modules/settings-center/settings-center.js','utf8');
const css=fs.readFileSync('public/modules/settings-center/settings-center.css','utf8');
const html=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['backend mounted',modules.includes('mountSettingsCenterModule(app, deps)')],
 ['status endpoint',routes.includes("router.get('/status'")],
 ['shopify checks',routes.includes("write_discounts")&&routes.includes("read_orders")],
 ['OpenAI limitation',routes.includes('Creative Studio AI generation is unavailable')],
 ['loyalty limitation',routes.includes('Loyalty database is not configured')],
 ['product health UI',js.includes('Product health')],
 ['connections UI',js.includes('Connections & services')],
 ['product settings UI',js.includes('Product settings')],
 ['legacy review settings retained',js.includes('state.legacyHtml')],
 ['reviews settings subtab',js.includes('Reviews settings')],
 ['limitation styling',css.includes('.gsc-limitations')],
 ['settings label updated',html.includes('Settings &amp; Health')],
 ['settings assets loaded',html.includes('/modules/settings-center/settings-center.js')]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('✓ '+name)}
console.log(`ELEV8 global settings centre smoke passed: ${checks.length} checks`);
