const fs=require('fs'),path=require('path');
const root=process.cwd();
const f=(...p)=>path.join(root,...p);
function read(...p){const file=f(...p);if(!fs.existsSync(file))throw new Error(`Missing ${file}`);return fs.readFileSync(file,'utf8')}
function write(p,s){fs.writeFileSync(f(...p),s)}

let index=read('src','modules','product-creation-import','index.js');
if(!index.includes("require('./catalogue-audit/catalogueAudit.routes')")){
  index=index.replace(
    "const productCreationImportRoutes = require('./productCreationImport.routes');",
    "const productCreationImportRoutes = require('./productCreationImport.routes');\nconst catalogueAuditRoutes = require('./catalogue-audit/catalogueAudit.routes');"
  );
}
if(!index.includes("app.use('/api/admin/product-creation-import/catalogue'")){
  index=index.replace(
    "app.use('/api/admin/product-creation-import', limiter, requireAdminSession, productCreationImportRoutes);",
    "app.use('/api/admin/product-creation-import/catalogue', limiter, requireAdminSession, catalogueAuditRoutes);\n  app.use('/api/admin/product-creation-import', limiter, requireAdminSession, productCreationImportRoutes);"
  );
}
write(['src','modules','product-creation-import','index.js'],index);

let html=read('public','admin.html');
if(!html.includes('/product-catalogue-audit.js')){
  const marker='</body>';
  if(!html.includes(marker)) throw new Error('Could not locate </body> in public/admin.html');
  html=html.replace(marker,'  <script src="/product-catalogue-audit.js"></script>\n</body>');
}
write(['public','admin.html'],html);


let batch=read('src','modules','product-creation-import','services','productImportBatch.service.js');
if(!batch.includes("require('./brandDirectoryProfile.service')")){
  batch=batch.replace(
    "const { applySupplierProfile, supplierDefaultsForUrl, profileForUrl } = require('./supplierProfile.service');",
    "const { applySupplierProfile, supplierDefaultsForUrl, profileForUrl } = require('./supplierProfile.service');\nconst { applyBrandDirectoryProfile } = require('./brandDirectoryProfile.service');"
  );
}
if(!batch.includes('await applyBrandDirectoryProfile({ shopDomain, draft })')){
  const marker='  draft = applySupplierProfile(draft);';
  if(!batch.includes(marker)) throw new Error('Could not locate supplier-profile application in productImportBatch.service.js');
  batch=batch.replace(marker,marker + "\n  draft = await applyBrandDirectoryProfile({ shopDomain, draft });");
}
write(['src','modules','product-creation-import','services','productImportBatch.service.js'],batch);

console.log('✓ Mounted catalogue audit API');
console.log('✓ Loaded Site Audit / Brand Directory admin UI');
console.log('✓ Connected Brand Directory context to future product imports');
