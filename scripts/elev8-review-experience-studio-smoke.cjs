const fs=require('fs'),assert=require('assert');
const js=fs.readFileSync('public/review-experience-studio.js','utf8');
const css=fs.readFileSync('public/review-experience-studio.css','utf8');
const html=fs.readFileSync('public/admin.html','utf8');
const checks=[
 ['journey modes',js.includes('data-res-mode="email"')&&js.includes('data-res-mode="landing"')&&js.includes('data-res-mode="form"')&&js.includes('data-res-mode="save"')],
 ['click edit',js.includes('inferControl(target)')],
 ['heading edit mapping',js.includes("return 'msg-heading'")],
 ['CTA edit mapping',js.includes("return 'msg-main-button-text'")],
 ['existing save draft reused',js.includes("$('msg-save-email-template')?.click()")],
 ['existing primary save reused',js.includes("$('msg-save-primary-template')?.click()")],
 ['existing delivery tab reused',js.includes("openMainTab('delivery')")],
 ['landing preview',js.includes('renderLanding()')],
 ['review form preview',js.includes('renderForm()')],
 ['sticky save bar',css.includes('.res-save-bar')],
 ['responsive rules',css.includes('@media(max-width:650px)')],
 ['css loaded',html.includes('/review-experience-studio.css?v=journey-studio-1')],
 ['js loaded',html.includes('/review-experience-studio.js?v=journey-studio-1')]
];
for(const [n,ok] of checks){assert.ok(ok,n);console.log('✓ '+n)}
console.log(`ELEV8 review experience studio smoke passed: ${checks.length} checks`);
