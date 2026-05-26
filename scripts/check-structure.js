const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'server.js',
  'src/app.js',
  'src/core/module-registry/index.js',
  'src/modules/reviews/module.config.js',
  'src/modules/loyalty/module.config.js',
  'src/modules/discounts/module.config.js',
  'src/modules/cart-rewards/module.config.js',
  'src/modules/campaigns/module.config.js',
  'src/modules/help/module.config.js',
  'public/admin/index.html',
  'public/admin/legacy-admin.css',
  'public/admin/legacy-admin.js',
  'public/admin.html',
  'public/review-widget.js'
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));

if (missing.length) {
  console.error('Missing required files:');
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log('Nectar modular structure check passed.');
