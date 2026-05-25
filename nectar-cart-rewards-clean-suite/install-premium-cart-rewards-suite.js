#!/usr/bin/env node
/*
  Install the premium modular Cart Rewards suite into nectar-reviews-api.

  Run from the repository root after unzipping this folder:
    node nectar-cart-rewards-premium-suite/install-premium-cart-rewards-suite.js

  What it does:
  - Updates the stable module shell and app product dropdown.
  - Keeps review-widget as the default Shopify app landing workspace.
  - Keeps the existing review admin intact and prepares a Reviews module folder/shim.
  - Installs the premium Cart Rewards admin: modal builder, product picker, design controls, planner and analytics.
  - Updates Cart Rewards backend routes for builder saves and analytics overview.
  - Updates the theme app extension fallback appearance settings.
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SOURCE_ROOT = __dirname;

function root(file) { return path.join(ROOT, file); }
function src(file) { return path.join(SOURCE_ROOT, file); }
function exists(file) { return fs.existsSync(root(file)); }
function read(file) { return fs.readFileSync(root(file), 'utf8'); }
function write(file, content) {
  fs.mkdirSync(path.dirname(root(file)), { recursive: true });
  fs.writeFileSync(root(file), content);
}
function backupOnce(file, suffix = '.before-premium-cart-rewards') {
  if (!exists(file)) return;
  const backup = `${file}${suffix}`;
  if (!exists(backup)) fs.copyFileSync(root(file), root(backup));
}
function copyFile(from, to) {
  const source = src(from);
  const dest = root(to);
  if (!fs.existsSync(source)) throw new Error(`Missing source file: ${source}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(source, dest);
  console.log(`Updated ${to}`);
}
function copyDir(from, to) {
  const source = src(from);
  const dest = root(to);
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const childFrom = path.join(from, entry.name);
    const childTo = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(childFrom, childTo);
    else copyFile(childFrom, childTo);
  }
}

function patchAdminHtml() {
  const file = 'public/admin.html';
  if (!exists(file)) {
    console.warn('⚠️ public/admin.html not found. Add /module-shell.css, /module-registry.js and /module-shell.js manually.');
    return;
  }

  backupOnce(file);
  let html = read(file);

  const cssTag = '<link rel="stylesheet" href="/module-shell.css">';
  const registryTag = '<script src="/module-registry.js" defer></script>';
  const shellTag = '<script src="/module-shell.js" defer></script>';

  if (!html.includes('/module-shell.css')) {
    html = html.includes('</head>') ? html.replace('</head>', `  ${cssTag}\n</head>`) : `${cssTag}\n${html}`;
  }

  html = html
    .replace(/\s*<link[^>]+href=["']\/cart-rewards-admin\.css["'][^>]*>\s*/g, '\n')
    .replace(/\s*<script[^>]+src=["']\/cart-rewards-admin\.js["'][^>]*><\/script>\s*/g, '\n');

  if (!html.includes('/module-registry.js')) {
    html = html.includes('</body>') ? html.replace('</body>', `  ${registryTag}\n</body>`) : `${html}\n${registryTag}\n`;
  }

  if (!html.includes('/module-shell.js')) {
    html = html.includes('</body>') ? html.replace('</body>', `  ${shellTag}\n</body>`) : `${html}\n${shellTag}\n`;
  }

  write(file, html);
  console.log('Patched public/admin.html');
}

function patchAppJs() {
  const file = 'src/app.js';
  if (!exists(file)) {
    console.warn('⚠️ src/app.js not found. Mount modules manually from src/modules/index.js.');
    return;
  }

  backupOnce(file);
  let app = read(file);

  const requireLine = "const { mountPlatformModules } = require('./modules');";
  if (!app.includes("require('./modules')")) {
    const firstRequire = app.match(/^const .+require\(.+\);/m);
    if (firstRequire) app = app.replace(firstRequire[0], `${firstRequire[0]}\n${requireLine}`);
    else app = `${requireLine}\n${app}`;
  }

  if (!app.includes('mountPlatformModules(app')) {
    const mountLine = 'mountPlatformModules(app, { makeRateLimiter, requireAdminSession });';
    const before = "app.use('/api', publicRoutes);";
    if (app.includes(before)) app = app.replace(before, `${mountLine}\n${before}`);
    else app = `${app}\n${mountLine}\n`;
  }

  write(file, app);
  console.log('Patched src/app.js');
}

function patchServerJs() {
  const file = 'server.js';
  if (!exists(file)) {
    console.warn('⚠️ server.js not found. Start module jobs manually by calling startPlatformModuleJobs() after connectDb().');
    return;
  }

  backupOnce(file);
  let server = read(file);

  const requireLine = "const { startPlatformModuleJobs } = require('./src/modules');";
  if (!server.includes('startPlatformModuleJobs')) {
    const firstRequire = server.match(/^const .+require\(.+\);/m);
    if (firstRequire) server = server.replace(firstRequire[0], `${firstRequire[0]}\n${requireLine}`);
    else server = `${requireLine}\n${server}`;
  }

  if (!server.includes('startPlatformModuleJobs();')) {
    const anchor = 'await connectDb();';
    if (server.includes(anchor)) server = server.replace(anchor, `${anchor}\n  startPlatformModuleJobs();`);
    else server = server.replace('app.listen', 'startPlatformModuleJobs();\napp.listen');
  }

  write(file, server);
  console.log('Patched server.js');
}

function patchPackage() {
  const file = 'package.json';
  if (!exists(file)) return;

  backupOnce(file);
  const pkg = JSON.parse(read(file));
  pkg.dependencies = pkg.dependencies || {};
  for (const [name, version] of Object.entries({ luxon: '^3.5.0', 'node-cron': '^3.0.3' })) {
    if (!pkg.dependencies[name]) pkg.dependencies[name] = version;
  }
  pkg.scripts = pkg.scripts || {};
  if (!pkg.scripts['cart-rewards:smoke']) pkg.scripts['cart-rewards:smoke'] = 'node scripts/cart-rewards-smoke-test.js';
  write(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log('Patched package.json');
}

function installFiles() {
  copyFile('public/module-registry.js', 'public/module-registry.js');
  copyFile('public/module-shell.js', 'public/module-shell.js');
  copyFile('public/module-shell.css', 'public/module-shell.css');
  copyDir('public/modules/cart-rewards', 'public/modules/cart-rewards');
  copyDir('public/modules/reviews', 'public/modules/reviews');
  copyFile('public/cart-rewards-admin.js', 'public/cart-rewards-admin.js');
  copyFile('public/cart-rewards-admin.css', 'public/cart-rewards-admin.css');

  copyDir('src/modules/cart-rewards', 'src/modules/cart-rewards');
  copyFile('src/modules/index.js', 'src/modules/index.js');
  copyFile('src/modules/moduleRegistry.js', 'src/modules/moduleRegistry.js');
  copyDir('src/modules/reviews', 'src/modules/reviews');

  copyDir('extensions/theme-app-extension', 'extensions/theme-app-extension');
  copyDir('extensions/checkout-ui-extension', 'extensions/checkout-ui-extension');
  copyDir('extensions/cart-reward-discount-function', 'extensions/cart-reward-discount-function');
  copyDir('docs', 'docs');
  copyDir('scripts', 'scripts');
}

function main() {
  if (!exists('package.json') || !exists('public/admin.html')) {
    console.error('Run this from the root of nectar-reviews-api. Expected package.json and public/admin.html.');
    process.exit(1);
  }

  installFiles();
  patchAdminHtml();
  patchAppJs();
  patchServerJs();
  patchPackage();

  console.log('\n✅ Premium Cart Rewards suite installed.');
  console.log('Next: npm install && npm run check && npm run cart-rewards:smoke');
  console.log('Then hard refresh /admin and switch App product → Cart Milestone Rewards.');
}

main();
