const fs=require('fs'),path=require('path');
const root=process.cwd(),F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(p,s)=>fs.writeFileSync(F(...p),s);

// Allow native manual reviews as a first-class source.
let models=R('src','models','index.js');
models=models.replace(
  "source: { type: String, enum: ['website', 'email', 'import'], default: 'website' }",
  "source: { type: String, enum: ['website', 'email', 'import', 'manual'], default: 'website' }"
);
W(['src','models','index.js'],models);

// Mount dedicated admin API.
let app=R('src','app.js');
if(!app.includes("require('./routes/manualReviews')")){
  app=app.replace(
    "const elev8CommercePulseRoutes = require('./routes/elev8CommercePulse');",
    "const elev8CommercePulseRoutes = require('./routes/elev8CommercePulse');\nconst manualReviewRoutes = require('./routes/manualReviews');"
  );
}
if(!app.includes("app.use('/api/admin/manual-reviews'")){
  app=app.replace(
    "app.use('/api/admin/elev8-commerce', requireAdminSession, elev8CommercePulseRoutes);",
    "app.use('/api/admin/elev8-commerce', requireAdminSession, elev8CommercePulseRoutes);\napp.use('/api/admin/manual-reviews', requireAdminSession, manualReviewRoutes);"
  );
}
W(['src','app.js'],app);

// Load the additive Review Manager interface.
let admin=R('public','admin.html');
if(!admin.includes('/manual-review-import.js')){
  admin=admin.replace('</body>','  <script src="/manual-review-import.js?v=manual-reviews-1" defer></script>\\n</body>');
}
W(['public','admin.html'],admin);

console.log('✓ Added manual review API');
console.log('✓ Added Manual Add button to Review Manager');
console.log('✓ Manual reviews save as pending batches until approval');
