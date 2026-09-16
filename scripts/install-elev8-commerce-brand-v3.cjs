const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(p,s)=>fs.writeFileSync(F(...p),s);

let app=R('src','app.js');
if(!app.includes("require('./routes/brandDirectoryV3')")){
  app=app.replace(
    "const brandDirectoryDirectRoutes = require('./routes/brandDirectoryDirect');",
    "const brandDirectoryDirectRoutes = require('./routes/brandDirectoryDirect');\nconst brandDirectoryV3Routes = require('./routes/brandDirectoryV3');\nconst elev8CommercePulseRoutes = require('./routes/elev8CommercePulse');"
  );
}
if(!app.includes("app.use('/api/admin/brand-directory-v3'")){
  app=app.replace(
    "mountPlatformModules(app, { makeRateLimiter, requireAdminSession });",
    "app.use('/api/admin/brand-directory-v3', requireAdminSession, brandDirectoryV3Routes);\napp.use('/api/admin/elev8-commerce', requireAdminSession, elev8CommercePulseRoutes);\nmountPlatformModules(app, { makeRateLimiter, requireAdminSession });"
  );
}
W(['src','app.js'],app);

let admin=R('public','admin.html');
if(!admin.includes('/elev8-commerce-rail.js')){
  admin=admin.replace('</body>',
    '  <script src="/elev8-commerce-rail.js?v=commerce-pulse-1" defer></script>\\n  <script src="/brand-directory-v3.js?v=brand-v3-1" defer></script>\\n</body>');
}
W(['public','admin.html'],admin);

console.log('✓ Mounted Brand Directory v3 before module mounts');
console.log('✓ Mounted ELEV8 commerce pulse API');
console.log('✓ Loaded dashboard quick-glance rail');
console.log('✓ Loaded Brand Directory v3 frontend');
