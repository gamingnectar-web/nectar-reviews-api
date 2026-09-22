const fs=require('fs'),path=require('path');
const root=process.cwd();
const srcJs=path.join(root,'public-review-experience-studio.js');
const srcCss=path.join(root,'public-review-experience-studio.css');
const dstJs=path.join(root,'public','review-experience-studio.js');
const dstCss=path.join(root,'public','review-experience-studio.css');
if(!fs.existsSync(srcJs)||!fs.existsSync(srcCss))throw new Error('Overlay source files missing');
fs.copyFileSync(srcJs,dstJs);
fs.copyFileSync(srcCss,dstCss);

const htmlFile=path.join(root,'public','admin.html');
let html=fs.readFileSync(htmlFile,'utf8');
if(!html.includes('/review-experience-studio.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="/review-experience-studio.css?v=journey-studio-1">\n</head>');
}
if(!html.includes('/review-experience-studio.js')){
  html=html.replace('</body>','  <script src="/review-experience-studio.js?v=journey-studio-1" defer></script>\n</body>');
}
fs.writeFileSync(htmlFile,html);
console.log('✓ Added visual Customer Journey Studio');
console.log('✓ Existing review email builder and backend save handlers preserved');
console.log('✓ Email preview is click-to-edit');
console.log('✓ Added Email / Landing / Review form / Save views');
console.log('✓ Added sticky Save draft / Save & make primary actions');
