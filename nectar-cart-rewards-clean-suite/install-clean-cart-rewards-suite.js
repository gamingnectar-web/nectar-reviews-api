#!/usr/bin/env node
/*
  Clean install / replace for Nectar Cart Rewards module.

  This is intentionally different from a patch-only installer:
  - It removes old Cart Rewards-owned files and folders first.
  - It copies fresh versions from this package.
  - It backs up anything it removes into .nectar-backups/cart-rewards-clean-<timestamp>/.
  - It does NOT delete the whole repo or the existing Reviews product.
  - It only touches core shared files with small idempotent hooks:
      public/admin.html, src/app.js, server.js, package.json

  Run from repo root:
    node nectar-cart-rewards-clean-suite/install-clean-cart-rewards-suite.js
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SOURCE_ROOT = __dirname;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_ROOT = path.join(ROOT, '.nectar-backups', `cart-rewards-clean-${STAMP}`);

function root(file) { return path.join(ROOT, file); }
function src(file) { return path.join(SOURCE_ROOT, file); }
function exists(file) { return fs.existsSync(root(file)); }
function read(file) { return fs.readFileSync(root(file), 'utf8'); }
function write(file, content) {
  fs.mkdirSync(path.dirname(root(file)), { recursive: true });
  fs.writeFileSync(root(file), content);
}
function backupPath(file) { return path.join(BACKUP_ROOT, file); }
function backupExisting(file) {
  const target = root(file);
  if (!fs.existsSync(target)) return;
  const dest = backupPath(file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(target, dest, { recursive: true, force: true });
  console.log(`Backed up ${file}`);
}
function removePath(file) {
  const target = root(file);
  if (!fs.existsSync(target)) return;
  backupExisting(file);
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed old ${file}`);
}
function copyFile(from, to) {
  const source = src(from);
  const dest = root(to);
  if (!fs.existsSync(source)) throw new Error(`Missing source file: ${source}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(source, dest);
  console.log(`Installed ${to}`);
}
function copyDir(from, to) {
  const source = src(from);
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const childFrom = path.join(from, entry.name);
    const childTo = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(childFrom, childTo);
    else copyFile(childFrom, childTo);
  }
}
function backupOnce(file, suffix = '.before-clean-cart-rewards') {
  if (!exists(file)) return;
  const backup = `${file}${suffix}`;
  if (!exists(backup)) fs.copyFileSync(root(file), root(backup));
}

function cleanOldCartRewardsFiles() {
  const pathsToReplace = [
    'public/module-registry.js',
    'public/module-shell.js',
    'public/module-shell.css',
    'public/cart-rewards-admin.js',
    'public/cart-rewards-admin.css',
    'public/modules/cart-rewards',
    'src/modules/cart-rewards',
    'docs/CART_REWARDS_INTEGRATION.md',
    'docs/MODULAR_APP_STRUCTURE.md',
    'scripts/cart-rewards-smoke-test.js',
    'extensions/cart-reward-discount-function',
    'extensions/checkout-ui-extension'
  ];

  for (const p of pathsToReplace) removePath(p);

  // Do not delete a merchant's whole theme-app-extension folder. Replace only module-owned storefront files.
  for (const p of [
    'extensions/theme-app-extension/assets/nectar-cart-rewards.css',
    'extensions/theme-app-extension/assets/nectar-cart-rewards.js',
    'extensions/theme-app-extension/blocks/cart-rewards-widget.liquid',
    'extensions/theme-app-extension/snippets/cart-reward-card.liquid'
  ]) removePath(p);

  // Reviews is prepared as a shim only. Back it up and replace only if it looks like the generated shim.
  const reviewShimFiles = ['public/modules/reviews/module.json', 'public/modules/reviews/README.md', 'src/modules/reviews/index.js'];
  const looksGeneratedReviewsShim = reviewShimFiles.some((p) => exists(p));
  if (looksGeneratedReviewsShim) {
    removePath('public/modules/reviews');
    removePath('src/modules/reviews');
  }
}

function installFreshFiles() {
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

function patchAdminHtml() {
  const file = 'public/admin.html';
  if (!exists(file)) {
    console.warn('⚠️ public/admin.html not found. Add module-shell assets manually.');
    return;
  }

  backupOnce(file);
  let html = read(file);

  const cssTag = '<link rel="stylesheet" href="/module-shell.css">';
  const registryTag = '<script src="/module-registry.js" defer></script>';
  const shellTag = '<script src="/module-shell.js" defer></script>';

  // Remove old direct Cart Rewards admin asset references. Cart Rewards is loaded by the shell now.
  html = html
    .replace(/\s*<link[^>]+href=["']\/cart-rewards-admin\.css["'][^>]*>\s*/g, '\n')
    .replace(/\s*<script[^>]+src=["']\/cart-rewards-admin\.js["'][^>]*><\/script>\s*/g, '\n');

  if (!html.includes('/module-shell.css')) {
    html = html.includes('</head>') ? html.replace('</head>', `  ${cssTag}\n</head>`) : `${cssTag}\n${html}`;
  }
  if (!html.includes('/module-registry.js')) {
    html = html.includes('</body>') ? html.replace('</body>', `  ${registryTag}\n</body>`) : `${html}\n${registryTag}\n`;
  }
  if (!html.includes('/module-shell.js')) {
    html = html.includes('</body>') ? html.replace('</body>', `  ${shellTag}\n</body>`) : `${html}\n${shellTag}\n`;
  }

  write(file, html);
  console.log('Ensured shared module shell assets in public/admin.html');
}

function patchAppJs() {
  const file = 'src/app.js';
  if (!exists(file)) {
    console.warn('⚠️ src/app.js not found. Mount src/modules manually.');
    return;
  }

  backupOnce(file);
  let app = read(file);

  const requireLine = "const { mountPlatformModules } = require('./modules');";
  if (!app.includes("require('./modules')")) {
    const firstRequire = app.match(/^const .+require\(.+\);/m);
    app = firstRequire ? app.replace(firstRequire[0], `${firstRequire[0]}\n${requireLine}`) : `${requireLine}\n${app}`;
  }

  if (!app.includes('mountPlatformModules(app')) {
    const mountLine = 'mountPlatformModules(app, { makeRateLimiter, requireAdminSession });';
    const before = "app.use('/api', publicRoutes);";
    app = app.includes(before) ? app.replace(before, `${mountLine}\n${before}`) : `${app}\n${mountLine}\n`;
  }

  write(file, app);
  console.log('Ensured module API mount in src/app.js');
}

function patchServerJs() {
  const file = 'server.js';
  if (!exists(file)) {
    console.warn('⚠️ server.js not found. Start module jobs manually after DB connection.');
    return;
  }

  backupOnce(file);
  let server = read(file);

  const requireLine = "const { startPlatformModuleJobs } = require('./src/modules');";
  if (!server.includes('startPlatformModuleJobs')) {
    const firstRequire = server.match(/^const .+require\(.+\);/m);
    server = firstRequire ? server.replace(firstRequire[0], `${firstRequire[0]}\n${requireLine}`) : `${requireLine}\n${server}`;
  }

  if (!server.includes('startPlatformModuleJobs();')) {
    const anchor = 'await connectDb();';
    server = server.includes(anchor) ? server.replace(anchor, `${anchor}\n  startPlatformModuleJobs();`) : server.replace('app.listen', 'startPlatformModuleJobs();\napp.listen');
  }

  write(file, server);
  console.log('Ensured module jobs start in server.js');
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
  pkg.scripts['cart-rewards:smoke'] = 'node scripts/cart-rewards-smoke-test.js';
  write(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log('Ensured package.json scripts/dependencies');
}

function main() {
  if (!exists('package.json') || !exists('public/admin.html')) {
    console.error('Run this from the root of nectar-reviews-api. Expected package.json and public/admin.html.');
    process.exit(1);
  }

  console.log('Starting clean Cart Rewards replacement...');
  cleanOldCartRewardsFiles();
  installFreshFiles();
  patchAdminHtml();
  patchAppJs();
  patchServerJs();
  patchPackage();

  console.log('\n✅ Clean Cart Rewards replacement installed.');
  console.log(`Backups, if any, are in: ${path.relative(ROOT, BACKUP_ROOT)}`);
  console.log('Next: npm install && npm run check && npm run cart-rewards:smoke');
  console.log('Then restart the server and hard-refresh /admin.');
}

main();
