const fs=require('fs'),path=require('path');
const file=path.join(process.cwd(),'public','admin.html');
let src=fs.readFileSync(file,'utf8');
if(!src.includes('/manual-review-ajax-draft.css')){
  src=src.replace('</head>','  <link rel="stylesheet" href="/manual-review-ajax-draft.css?v=ajax-draft-1">\n</head>');
}
src=src.replace(/\/manual-review-image-import\.js\?v=[^"]+/g,'/manual-review-image-import.js?v=ajax-draft-1');
fs.writeFileSync(file,src);
console.log('✓ AJAX draft UI asset wired');
