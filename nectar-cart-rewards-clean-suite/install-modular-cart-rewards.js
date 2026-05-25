#!/usr/bin/env node
/*
  Install the modular Cart Rewards integration into nectar-reviews-api.

  Run from the repository root after unzipping this folder:
    node nectar-modular-cart-rewards/install-modular-cart-rewards.js

  What it does:
  - Copies Cart Rewards into src/modules/cart-rewards.
  - Adds module registry and Reviews module shim under src/modules.
  - Copies the modular admin assets into public/modules/cart-rewards and public/modules/reviews.
  - Adds the app product switcher/module shell to public/admin.html.
  - Mounts folderised module routes from src/app.js.
  - Keeps existing review-widget admin code intact and default.
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SOURCE_ROOT = __dirname;

function absRoot(file) {
  return path.join(ROOT, file);
}

function absSource(file) {
  return path.join(SOURCE_ROOT, file);
}

function exists(file) {
  return fs.existsSync(absRoot(file));
}

function read(file) {
  return fs.readFileSync(absRoot(file), 'utf8');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(absRoot(file)), { recursive: true });
  fs.writeFileSync(absRoot(file), content);
}

function copyDir(src, dest) {
  const fromRoot = absSource(src);
  const toRoot = absRoot(dest);
  fs.mkdirSync(toRoot, { recursive: true });

  for (const entry of fs.readdirSync(fromRoot, { withFileTypes: true })) {
    const from = path.join(fromRoot, entry.name);
    const to = path.join(toRoot, entry.name);
    if (entry.isDirectory()) {
      copyDir(path.relative(SOURCE_ROOT, from), path.relative(ROOT, to));
    } else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

function copyFile(src, dest) {
  const from = absSource(src);
  const to = absRoot(dest);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function backupOnce(file) {
  if (!exists(file)) return;
  const backup = `${file}.before-modular-cart-rewards`;
  if (!exists(backup)) fs.copyFileSync(absRoot(file), absRoot(backup));
}

function patchAdminHtml() {
  const file = 'public/admin.html';
  if (!exists(file)) {
    console.warn('⚠️ public/admin.html not found. Add module-registry.js and module-shell.js manually.');
    return;
  }

  backupOnce(file);
  let html = read(file);

  const cssTag = '<link rel="stylesheet" href="/module-shell.css">';
  const registryTag = '<script src="/module-registry.js" defer></script>';
  const shellTag = '<script src="/module-shell.js" defer></script>';

  if (!html.includes('/module-shell.css')) {
    if (html.includes('</head>')) html = html.replace('</head>', `  ${cssTag}\n</head>`);
    else html = `${cssTag}\n${html}`;
  }

  // Remove direct Cart Rewards admin injection from earlier ZIPs. It is now loaded by module-shell.js.
  html = html
    .replace(/\s*<link[^>]+href=["']\/cart-rewards-admin\.css["'][^>]*>\s*/g, '\n')
    .replace(/\s*<script[^>]+src=["']\/cart-rewards-admin\.js["'][^>]*><\/script>\s*/g, '\n');

  if (!html.includes('/module-registry.js')) {
    if (html.includes('</body>')) html = html.replace('</body>', `  ${registryTag}\n</body>`);
    else html += `\n${registryTag}\n`;
  }

  if (!html.includes('/module-shell.js')) {
    if (html.includes('</body>')) html = html.replace('</body>', `  ${shellTag}\n</body>`);
    else html += `\n${shellTag}\n`;
  }

  write(file, html);
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
    const anchor = "const loyaltyCheckoutRoutes = require('./routes/loyaltyCheckout');";
    if (app.includes(anchor)) app = app.replace(anchor, `${anchor} ${requireLine}`);
    else app = `${requireLine} ${app}`;
  }


  if (!app.includes('mountPlatformModules(app')) {
    const mountLine = 'mountPlatformModules(app, { makeRateLimiter, requireAdminSession });';
    const before = "app.use('/api', publicRoutes);";
    if (app.includes(before)) app = app.replace(before, `${mountLine} ${before}`);
    else app = `${app} ${mountLine}`;
  }

  write(file, app);
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
  if (!server.includes("startPlatformModuleJobs")) {
    const anchor = "const { env } = require('./src/config/env');";
    if (server.includes(anchor)) server = server.replace(anchor, `${anchor} ${requireLine}`);
    else server = `${requireLine} ${server}`;
  }

  if (!server.includes('startPlatformModuleJobs();')) {
    const anchor = 'await connectDb();';
    if (server.includes(anchor)) server = server.replace(anchor, `${anchor} startPlatformModuleJobs();`);
    else server = server.replace('app.listen', 'startPlatformModuleJobs(); app.listen');
  }

  write(file, server);
}

function copyModuleFiles() {
  copyDir('src/modules/cart-rewards', 'src/modules/cart-rewards');
  copyFile('src/modules/index.js', 'src/modules/index.js');
  copyFile('src/modules/moduleRegistry.js', 'src/modules/moduleRegistry.js');
  copyDir('src/modules/reviews', 'src/modules/reviews');

  copyFile('public/module-registry.js', 'public/module-registry.js');
  copyFile('public/module-shell.js', 'public/module-shell.js');
  copyFile('public/module-shell.css', 'public/module-shell.css');
  copyDir('public/modules/cart-rewards', 'public/modules/cart-rewards');
  copyDir('public/modules/reviews', 'public/modules/reviews');

  // Compatibility shims for any older admin.html references.
  copyFile('public/cart-rewards-admin.js', 'public/cart-rewards-admin.js');
  copyFile('public/cart-rewards-admin.css', 'public/cart-rewards-admin.css');
}

function copyExtensionsAndDocs() {
  if (fs.existsSync(absSource('extensions'))) copyDir('extensions', 'extensions');
  if (fs.existsSync(absSource('docs'))) copyDir('docs', 'docs');
  if (fs.existsSync(absSource('scripts'))) copyDir('scripts', 'scripts');
}

function patchPackageDeps() {
  const file = 'package.json';
  if (!exists(file)) return;

  backupOnce(file);
  const pkg = JSON.parse(read(file));
  pkg.dependencies = pkg.dependencies || {};

  const deps = {
    luxon: '^3.5.0',
    'node-cron': '^3.0.3'
  };

  for (const [name, version] of Object.entries(deps)) {
    if (!pkg.dependencies[name]) pkg.dependencies[name] = version;
  }

  pkg.scripts = pkg.scripts || {};
  if (!pkg.scripts['cart-rewards:smoke']) {
    pkg.scripts['cart-rewards:smoke'] = 'node scripts/cart-rewards-smoke-test.js';
  }

  write(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function main() {
  if (!exists('package.json') || !exists('src/app.js') || !exists('public/admin.html')) {
    console.error('Run this from the root of nectar-reviews-api. Expected package.json, src/app.js and public/admin.html.');
    process.exit(1);
  }

  copyModuleFiles();
  copyExtensionsAndDocs();
  patchAdminHtml();
  patchAppJs();
  patchServerJs();
  patchPackageDeps();

  console.log('✅ Modular Cart Rewards integration installed.');
  console.log('Default Shopify app landing remains review-widget.');
  console.log('Cart Rewards now lives under public/modules/cart-rewards and src/modules/cart-rewards.');
  console.log('Next: npm install && npm run check && npm run cart-rewards:smoke');
}

main();
