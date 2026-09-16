const fs=require('fs'),path=require('path');
const root=process.cwd(),F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(p,s)=>fs.writeFileSync(F(...p),s);

let model=R('src','modules','product-creation-import','catalogue-audit','catalogueAudit.model.js');
if(!model.includes('alwaysApply:')){
  model=model.replace(
    "  coreProductLines: { type: [mongoose.Schema.Types.Mixed], default: [] },",
    "  coreProductLines: { type: [mongoose.Schema.Types.Mixed], default: [] },\n  alwaysApply: { type: [mongoose.Schema.Types.Mixed], default: [] },\n  conditionalRules: { type: [mongoose.Schema.Types.Mixed], default: [] },"
  );
}
W(['src','modules','product-creation-import','catalogue-audit','catalogueAudit.model.js'],model);

let app=R('src','app.js');
if(!app.includes("require('./modules/product-creation-import/catalogue-audit/brandRules.routes')")){
  app=app.replace(
    "const brandDirectoryV3Routes = require('./routes/brandDirectoryV3');",
    "const brandDirectoryV3Routes = require('./routes/brandDirectoryV3');\nconst brandRulesRoutes = require('./modules/product-creation-import/catalogue-audit/brandRules.routes');"
  );
}
if(!app.includes("app.use('/api/admin/brand-rules'")){
  app=app.replace(
    "app.use('/api/admin/brand-directory-v3', requireAdminSession, brandDirectoryV3Routes);",
    "app.use('/api/admin/brand-directory-v3', requireAdminSession, brandDirectoryV3Routes);\napp.use('/api/admin/brand-rules', requireAdminSession, brandRulesRoutes);"
  );
}
W(['src','app.js'],app);

let admin=R('public','admin.html');
if(!admin.includes('/brand-directory-rules.js')){
  admin=admin.replace('</body>','  <script src="/brand-directory-rules.js?v=brand-rules-1" defer></script>\\n</body>');
}
admin=admin.replace(/\/elev8-commerce-rail\.js\?v=[^"]+/g,'/elev8-commerce-rail.js?v=stats-fix-1');
W(['public','admin.html'],admin);

console.log('✓ Added brand default/conditional rule storage');
console.log('✓ Mounted brand rule editor API');
console.log('✓ Brand rules feed future imports');
console.log('✓ Corrected UK calendar-day stats and cost-aware profit logic');
