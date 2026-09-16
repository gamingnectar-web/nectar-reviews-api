const fs=require('fs'),path=require('path');
const root=process.cwd();
const f=(...p)=>path.join(root,...p);
const read=(...p)=>{const file=f(...p);if(!fs.existsSync(file))throw new Error(`Missing ${file}`);return fs.readFileSync(file,'utf8')};
const write=(p,s)=>fs.writeFileSync(f(...p),s);

// Mount a direct Brand Directory route in app.js. This bypasses module-routing ambiguity.
let app=read('src','app.js');
if(!app.includes("require('./routes/brandDirectoryDirect')")){
  app=app.replace(
    "const elev8DashboardRoutes = require('./routes/elev8Dashboard');",
    "const elev8DashboardRoutes = require('./routes/elev8Dashboard');\nconst brandDirectoryDirectRoutes = require('./routes/brandDirectoryDirect');"
  );
}
if(!app.includes("app.use('/api/admin/brand-directory-v2'")){
  app=app.replace(
    "mountPlatformModules(app, { makeRateLimiter, requireAdminSession });",
    "mountPlatformModules(app, { makeRateLimiter, requireAdminSession });\napp.use('/api/admin/brand-directory-v2', requireAdminSession, brandDirectoryDirectRoutes);"
  );
}
write(['src','app.js'],app);

// Load the navigation and live-brand fixes in the admin UI.
let admin=read('public','admin.html');
for(const tag of [
  '<script src="/elev8-context-nav.js?v=e8-context-1" defer></script>',
  '<script src="/brand-directory-live-fix.js?v=brand-live-1" defer></script>'
]){
  const src=tag.match(/src="([^"]+)/)?.[1];
  if(src&&!admin.includes(src))admin=admin.replace('</body>',`  ${tag}\n</body>`);
}
write(['public','admin.html'],admin);

// Make the progress modal try the direct route before legacy paths.
let progress=read('public','brand-scrape-progress.js');
if(progress.includes("const bases=['/api/admin/product-creation-import/catalogue','/api/admin/product-creation-import'];")){
  progress=progress.replace(
    "const bases=['/api/admin/product-creation-import/catalogue','/api/admin/product-creation-import'];",
    "const bases=['/api/admin/brand-directory-v2','/api/admin/product-creation-import/catalogue','/api/admin/product-creation-import'];"
  );
}
write(['public','brand-scrape-progress.js'],progress);

console.log('✓ Mounted direct Brand Directory v2 API');
console.log('✓ Added Gaming Nectar storefront brand backfill');
console.log('✓ Fixed dashboard module navigation');
console.log('✓ Replaced global sidebar clutter with contextual navigation');
