const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(parts,s)=>fs.writeFileSync(F(...parts),s);

// Module registry
let registry=R('src','modules','moduleRegistry.js');
if(!registry.includes("id: 'marketing-intelligence'")){
  const marker="const modules = [";
  registry=registry.replace(marker,`${marker}
  {
    id: 'marketing-intelligence',
    productSlug: 'marketing-intelligence',
    label: 'Marketing Intelligence & Creative Studio',
    description: 'Sales-led marketing opportunities, commercial product prioritisation and premium AI-assisted creative.',
    status: 'beta',
    adminFolder: 'public/modules/marketing-intelligence',
    apiNamespace: '/api/admin/marketing-intelligence'
  },
`);
}
W(['src','modules','moduleRegistry.js'],registry);

// Module mount
let modules=R('src','modules','index.js');
if(!modules.includes("require('./marketing-intelligence')")){
  modules=modules.replace(
    "const { mountNotificationsModule, startNotificationsJobs } = require('./notifications');",
    "const { mountNotificationsModule, startNotificationsJobs } = require('./notifications');\nconst { mountMarketingIntelligenceModule, startMarketingIntelligenceJobs } = require('./marketing-intelligence');"
  );
}
if(!modules.includes("mountMarketingIntelligenceModule(app, deps);")){
  modules=modules.replace(
    "  mountNotificationsModule(app, deps);",
    "  mountNotificationsModule(app, deps);\n  mountMarketingIntelligenceModule(app, deps);"
  );
}
if(!modules.includes("startMarketingIntelligenceJobs();")){
  modules=modules.replace(
    "  startNotificationsJobs();",
    "  startNotificationsJobs();\n  startMarketingIntelligenceJobs();"
  );
}
W(['src','modules','index.js'],modules);

// Admin UI
let html=R('public','admin.html');
if(!html.includes('v-marketing-intelligence')){
  const navMarker=`          <button class="tab-btn product-tab-btn" data-product-key="referrals"`;
  const idx=html.indexOf(navMarker);
  if(idx<0)throw new Error('Products navigation marker not found in admin.html');
  const nav=`          <button class="tab-btn product-tab-btn" data-product-key="marketing-intelligence" onclick="window.tab('v-marketing-intelligence')"><span>Marketing Intelligence <span class="tab-status-dot warning" title="Marketing Intelligence beta"></span></span><span class="pill">Beta</span></button>\n`;
  html=html.slice(0,idx)+nav+html.slice(idx);

  const mainClose=html.lastIndexOf('</main>');
  if(mainClose<0)throw new Error('</main> not found in admin.html');
  const view=`
      <section id="v-marketing-intelligence" class="view">
        <div class="mi-loading">Loading Marketing Intelligence…</div>
      </section>
`;
  html=html.slice(0,mainClose)+view+html.slice(mainClose);
}
if(!html.includes('/modules/marketing-intelligence/marketing-intelligence.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="/modules/marketing-intelligence/marketing-intelligence.css?v=mi-1">\n</head>');
}
if(!html.includes('/modules/marketing-intelligence/marketing-intelligence.js')){
  html=html.replace('</body>','  <script src="/modules/marketing-intelligence/marketing-intelligence.js?v=mi-1" defer></script>\n</body>');
}
W(['public','admin.html'],html);

// Dashboard tile
let dash=R('public','elev8-dashboard.js');
if(!dash.includes('data-open="marketing"')){
  const target=`<button class="e8-tile" data-open="settings"><span class="e8-tile-icon">⚙</span><h3>Settings & Health</h3>`;
  const replacement=`<button class="e8-tile" data-open="marketing"><span class="e8-tile-icon">↗</span><h3>Marketing Intelligence</h3><p>Find what to push next and create premium campaign visuals.</p><b>→</b></button>${target}`;
  if(!dash.includes(target))throw new Error('Dashboard settings tile marker not found');
  dash=dash.replace(target,replacement);
}
if(!dash.includes("marketing:['marketing intelligence'")){
  dash=dash.replace(
    "settings:['settings','health']",
    "marketing:['marketing intelligence'],settings:['settings','health']"
  );
}
W(['public','elev8-dashboard.js'],dash);

console.log('✓ Registered Marketing Intelligence as an ELEV8 module');
console.log('✓ Mounted Marketing Intelligence API');
console.log('✓ Added Marketing Intelligence admin navigation + view');
console.log('✓ Added Marketing Intelligence to the ELEV8 home dashboard');
