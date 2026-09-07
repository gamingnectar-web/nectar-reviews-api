const fs=require('fs'),path=require('path');
const root=process.cwd();
function f(...p){return path.join(root,...p)}
function read(...p){const file=f(...p);if(!fs.existsSync(file))throw new Error(`Missing ${file}`);return fs.readFileSync(file,'utf8')}
function write(parts,src){fs.writeFileSync(f(...parts),src)}
let idx=read('src','modules','index.js');
if(!idx.includes("require('./notifications')")){
  idx=idx.replace("const { mountProductCreationImportModule, startProductCreationImportJobs } = require('./product-creation-import');","const { mountProductCreationImportModule, startProductCreationImportJobs } = require('./product-creation-import');\nconst { mountNotificationsModule, startNotificationsJobs } = require('./notifications');");
  idx=idx.replace('mountProductCreationImportModule(app, deps);','mountProductCreationImportModule(app, deps);\n  mountNotificationsModule(app, deps);');
  idx=idx.replace('startProductCreationImportJobs();','startProductCreationImportJobs();\n  startNotificationsJobs();');
}
write(['src','modules','index.js'],idx);
let reg=read('src','modules','moduleRegistry.js');
if(!reg.includes("id: 'notifications'")){
  const block=`  {\n    id: 'notifications',\n    productSlug: 'notifications',\n    label: 'Notifications & Tracking',\n    description: 'Customer order tracking, restock alerts, price drops and account notifications.',\n    status: 'beta',\n    adminFolder: 'public/modules/notifications',\n    apiNamespace: '/api/admin/notifications'\n  },\n`;
  reg=reg.replace('const modules = [',`const modules = [\n${block}`);
}
write(['src','modules','moduleRegistry.js'],reg);
console.log('ELEV8 Notifications module installed');
