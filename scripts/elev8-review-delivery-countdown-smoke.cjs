const fs=require('fs'),assert=require('assert');
const automation=fs.readFileSync('src/modules/reviews/reviewRequestAutomation.js','utf8');
const models=fs.readFileSync('src/models/index.js','utf8');
const msg=fs.readFileSync('public/admin-messaging-campaigns.js','utf8');
const ops=fs.readFileSync('public/review-operations.js','utf8');
const css=fs.readFileSync('public/review-operations-countdown.css','utf8');
const html=fs.readFileSync('public/admin.html','utf8');

const checks=[
 ['default 7 days',automation.includes('const DEFAULT_DELAY_DAYS = 7;')],
 ['schema default 7 days',models.includes('delayDays: { type: Number, default: 7')],
 ['builder labels confirmed delivery',msg.includes('Wait after confirmed delivery')],
 ['builder selects 7 by default',msg.includes('<option value="7" selected>7 days</option>')],
 ['template fallback 7',msg.includes("String(d.delayDays || 7)")],
 ['test centre says delivered',html.includes('waits for Shopify to confirm <strong>Delivered</strong>')],
 ['operations journey cards',ops.includes('review-order-card')],
 ['ordered milestone',ops.includes("timelineStep('Ordered'")],
 ['dispatched milestone',ops.includes("timelineStep('Dispatched'")],
 ['delivered milestone',ops.includes("timelineStep('Delivered'")],
 ['review email milestone',ops.includes("timelineStep('Review email'")],
 ['7-day countdown',ops.includes("'7-day review countdown'")],
 ['countdown progress',ops.includes('review-order-progress')],
 ['Shopify tracking retained',ops.includes('Open tracking ↗')],
 ['responsive styling',css.includes('@media(max-width:620px)')],
 ['new css loaded',html.includes('/review-operations-countdown.css?v=shopify-countdown-1')],
 ['cache bust',html.includes('/review-operations.js?v=shopify-countdown-1')]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('✓ '+name)}
console.log(`ELEV8 review delivery countdown smoke passed: ${checks.length} checks`);
