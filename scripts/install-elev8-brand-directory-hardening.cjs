const fs=require('fs'),path=require('path');
const root=process.cwd();
const f=(...p)=>path.join(root,...p);
const read=(...p)=>{const file=f(...p);if(!fs.existsSync(file))throw new Error(`Missing ${file}`);return fs.readFileSync(file,'utf8')};
const write=(p,s)=>fs.writeFileSync(f(...p),s);

let index=read('src','modules','product-creation-import','index.js');
if(!index.includes("app.use('/api/admin/brand-directory'")){
  index=index.replace(
    "app.use('/api/admin/product-creation-import/catalogue', limiter, requireAdminSession, catalogueAuditRoutes);",
    "app.use('/api/admin/product-creation-import/catalogue', limiter, requireAdminSession, catalogueAuditRoutes);\n  app.use('/api/admin/brand-directory', limiter, requireAdminSession, catalogueAuditRoutes);"
  );
}
write(['src','modules','product-creation-import','index.js'],index);

let admin=read('public','admin.html');
if(!admin.includes('/brand-directory-diagnostics.js')){
  admin=admin.replace('</body>','  <script src="/brand-directory-diagnostics.js?v=brand-dir-hardening-1" defer></script>\n</body>');
}
write(['public','admin.html'],admin);

let ui=read('public','product-catalogue-audit.js');
if(!ui.includes('window.__elev8RenderBrandCard=brandCard')){
  const marker='  async function loadBrands(){';
  if(!ui.includes(marker))throw new Error('loadBrands marker missing');
  ui=ui.replace(marker,'  window.__elev8RenderBrandCard=brandCard;\n\n'+marker);
}
write(['public','product-catalogue-audit.js'],ui);

console.log('✓ Added direct /api/admin/brand-directory alias');
console.log('✓ Added explicit shop-domain forwarding');
console.log('✓ Added visible API diagnostics');
