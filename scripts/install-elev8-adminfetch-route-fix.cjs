const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(p,s)=>fs.writeFileSync(F(...p),s);

let admin=R('public','admin.html');

// Disable legacy Brand Directory scripts that keep issuing the old broken requests
// and can overwrite the successful v3 UI with "Not found".
admin=admin
  .replace(/\s*<script[^>]+src="\/brand-directory-diagnostics\.js[^"]*"[^>]*><\/script>/g,'')
  .replace(/\s*<script[^>]+src="\/brand-directory-live-fix\.js[^"]*"[^>]*><\/script>/g,'');

// Keep the original progress modal, but add a route-fix controller after it.
if(!admin.includes('/brand-scrape-route-fix.js')){
  admin=admin.replace('</body>','  <script src="/brand-scrape-route-fix.js?v=adminfetch-fix-1" defer></script>\\n</body>');
}

// Ensure latest v3/commerce assets get cache-busted.
admin=admin
  .replace(/\/brand-directory-v3\.js\?v=[^"]+/g,'/brand-directory-v3.js?v=adminfetch-fix-1')
  .replace(/\/elev8-commerce-rail\.js\?v=[^"]+/g,'/elev8-commerce-rail.js?v=adminfetch-fix-1');

W(['public','admin.html'],admin);

console.log('✓ Removed legacy Brand Directory scripts');
console.log('✓ Corrected adminFetch route handling');
console.log('✓ Added brand scrape route fix');
