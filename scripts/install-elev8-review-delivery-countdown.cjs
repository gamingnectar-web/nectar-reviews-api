const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(parts,s)=>fs.writeFileSync(F(...parts),s);

// 1) Default review delay becomes 7 days after confirmed delivery.
let automation=R('src','modules','reviews','reviewRequestAutomation.js');
automation=automation.replace("const DEFAULT_DELAY_DAYS = 14;","const DEFAULT_DELAY_DAYS = 7;");
W(['src','modules','reviews','reviewRequestAutomation.js'],automation);

let models=R('src','models','index.js');
models=models.replace(
  "delayDays: { type: Number, default: 14, min: 0, max: 365 },",
  "delayDays: { type: Number, default: 7, min: 0, max: 365 },"
);
W(['src','models','index.js'],models);

// 2) Email builder defaults/wording now describe confirmed delivery, not fulfilment.
let msg=R('public','admin-messaging-campaigns.js');
msg=msg.replace(
  '<label>Wait after fulfilment</label><select id="msg-delay-days"><option value="7">7 days</option><option value="10">10 days</option><option value="14" selected>14 days</option><option value="21">21 days</option><option value="30">30 days</option></select>',
  '<label>Wait after confirmed delivery</label><select id="msg-delay-days"><option value="7" selected>7 days</option><option value="10">10 days</option><option value="14">14 days</option><option value="21">21 days</option><option value="30">30 days</option></select>'
);
msg=msg.replace(
  "if (el('msg-delay-days')) el('msg-delay-days').value = String(d.delayDays || 14);",
  "if (el('msg-delay-days')) el('msg-delay-days').value = String(d.delayDays || 7);"
);
W(['public','admin-messaging-campaigns.js'],msg);

// 3) Test centre/help text reflects the actual live rule.
let html=R('public','admin.html');
html=html.replace(
  'Shopify sends the fulfilled-order webhook, Nectar waits 14 days, then sends the email.',
  'Shopify sends the fulfilled-order webhook, ELEV8 waits for Shopify to confirm delivery, then counts down 7 days before sending the review email.'
);
html=html.replace(
  'The job waits <strong>14 days</strong> by default, then sends the review request from the saved Reviews email provider.',
  'The job waits for Shopify to confirm <strong>Delivered</strong>. From that delivery timestamp, ELEV8 counts down <strong>7 days</strong>, then sends the review request from the saved Reviews email provider.'
);
html=html.replace(
  'Operational view of every review request: when the order was placed, parcel status, timer state, and whether the email was successfully handed to the email provider.',
  'A Shopify-style journey for each review request: order → dispatch → delivered → 7-day review countdown → email sent.'
);
html=html.replace(/\/review-operations\.js\?v=[^"]+/g,'/review-operations.js?v=shopify-countdown-1');
W(['public','admin.html'],html);

console.log('✓ Default review request delay changed to 7 days');
console.log('✓ Countdown is described as starting from Shopify confirmed delivery');
console.log('✓ Builder default and help text updated');
console.log('✓ Review Operations asset cache-busted');
