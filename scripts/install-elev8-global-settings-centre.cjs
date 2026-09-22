const fs=require('fs'),path=require('path');
const root=process.cwd();
const F=(...p)=>path.join(root,...p);
const R=(...p)=>{const f=F(...p);if(!fs.existsSync(f))throw new Error(`Missing ${f}`);return fs.readFileSync(f,'utf8')};
const W=(parts,s)=>fs.writeFileSync(F(...parts),s);

// Mount backend settings centre.
let modules=R('src','modules','index.js');
if(!modules.includes("require('./settings-center')")){
  const marker="const { mountMarketingIntelligenceModule, startMarketingIntelligenceJobs } = require('./marketing-intelligence');";
  if(!modules.includes(marker))throw new Error('Marketing Intelligence module marker not found');
  modules=modules.replace(marker,marker+"\nconst { mountSettingsCenterModule, startSettingsCenterJobs } = require('./settings-center');");
}
if(!modules.includes('mountSettingsCenterModule(app, deps);')){
  const marker='  mountMarketingIntelligenceModule(app, deps);';
  if(!modules.includes(marker))throw new Error('Marketing Intelligence mount marker not found');
  modules=modules.replace(marker,marker+"\n  mountSettingsCenterModule(app, deps);");
}
if(!modules.includes('startSettingsCenterJobs();')){
  const marker='  startMarketingIntelligenceJobs();';
  if(!modules.includes(marker))throw new Error('Marketing Intelligence jobs marker not found');
  modules=modules.replace(marker,marker+"\n  startSettingsCenterJobs();");
}
W(['src','modules','index.js'],modules);

// Make Settings clearly platform-wide in navigation.
let html=R('public','admin.html');
html=html.replace(
  '<button class="tab-btn" onclick="window.tab(\'v-settings\')">App Settings &amp; Render Names</button>',
  '<button class="tab-btn" onclick="window.tab(\'v-settings\')">Settings &amp; Health</button>'
);
if(!html.includes('/modules/settings-center/settings-center.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="/modules/settings-center/settings-center.css?v=settings-centre-1">\n</head>');
}
if(!html.includes('/modules/settings-center/settings-center.js')){
  html=html.replace('</body>','  <script src="/modules/settings-center/settings-center.js?v=settings-centre-1" defer></script>\n</body>');
}
W(['public','admin.html'],html);

// Dashboard/settings wording stays platform-wide.
let dash=R('public','elev8-dashboard.js');
dash=dash.replace(
  '<h3>Settings & Health</h3><p>Connections, delivery and platform health.</p>',
  '<h3>Settings & Health</h3><p>Connections, product settings, limitations and platform health.</p>'
);
W(['public','elev8-dashboard.js'],dash);

// Context navigation should recognise new label.
let nav=R('public','elev8-context-nav.js');
nav=nav.replace("settings:['Settings']","settings:['Settings & Health','Settings']");
W(['public','elev8-context-nav.js'],nav);

console.log('✓ Global Settings & Health API mounted');
console.log('✓ Existing review-specific settings preserved as a Reviews settings tab');
console.log('✓ Settings renamed platform-wide');
console.log('✓ Product/integration limitations surfaced centrally');
