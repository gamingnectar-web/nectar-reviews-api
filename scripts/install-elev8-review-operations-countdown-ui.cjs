const fs=require('fs'),path=require('path');
const root=process.cwd();
const srcJs=path.join(root,'public-review-operations.js');
const srcCss=path.join(root,'public-review-operations-countdown.css');
const dstJs=path.join(root,'public','review-operations.js');
const dstCss=path.join(root,'public','review-operations-countdown.css');

if(!fs.existsSync(srcJs)||!fs.existsSync(srcCss))throw new Error('Review operations overlay files missing');
fs.copyFileSync(srcJs,dstJs);
fs.copyFileSync(srcCss,dstCss);

const htmlFile=path.join(root,'public','admin.html');
let html=fs.readFileSync(htmlFile,'utf8');
if(!html.includes('/review-operations-countdown.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="/review-operations-countdown.css?v=shopify-countdown-1">\n</head>');
}
fs.writeFileSync(htmlFile,html);

console.log('✓ Review Operations changed from dense table to Shopify-style order journey cards');
console.log('✓ Delivered orders now show a visible 7-day countdown and progress bar');
console.log('✓ Dispatch, delivery, tracking, due date and send state are visible together');
