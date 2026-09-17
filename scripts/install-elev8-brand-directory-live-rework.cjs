const fs=require('fs'),path=require('path');
const root=process.cwd();
const file=path.join(root,'public','admin.html');
if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
let html=fs.readFileSync(file,'utf8');

const legacy=[
  'brand-scrape-progress.js',
  'brand-scrape-route-fix.js',
  'brand-directory-v3.js',
  'brand-directory-rules.js',
  'brand-directory-live-fix.js',
  'brand-directory-diagnostics.js'
];
for(const asset of legacy){
  const re=new RegExp(`\\s*<script[^>]+src=["'][^"']*${asset.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')}[^"']*["'][^>]*><\\/script>`,'gi');
  html=html.replace(re,'');
}

if(!html.includes('/brand-directory-workspace.js')){
  html=html.replace('</body>','  <script src="/brand-directory-workspace.js?v=brand-workspace-1" defer></script>\\n</body>');
}
if(!html.includes('/elev8-view-isolation.js')){
  html=html.replace('</body>','  <script src="/elev8-view-isolation.js?v=view-isolation-1" defer></script>\\n</body>');
}
fs.writeFileSync(file,html);

const app=fs.readFileSync(path.join(root,'src','app.js'),'utf8');
if(!app.includes("app.use('/api/admin/brand-directory-v3'"))throw new Error('Brand Directory v3 route is not mounted in src/app.js');
if(!app.includes("app.use('/api/admin/brand-rules'"))throw new Error('Brand Rules route is not mounted in src/app.js');

console.log('✓ Removed competing legacy Brand Directory frontends');
console.log('✓ Loaded one Brand Directory workspace');
console.log('✓ Loaded view isolation guard');
console.log('✓ Confirmed Brand Directory and Brand Rules API mounts');
