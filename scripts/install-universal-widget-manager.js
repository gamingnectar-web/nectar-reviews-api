
const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'public', 'admin.html');
if (!fs.existsSync(file)) throw new Error('public/admin.html not found. Run from the repo root.');

let html = fs.readFileSync(file, 'utf8');
const tag = '<script src="/admin-widget-library-universal.js?v=uwm-20260827-1" defer></script>';

if (!html.includes('/admin-widget-library-universal.js')) {
  if (html.includes('</body>')) html = html.replace('</body>', `  ${tag}\n</body>`);
  else html += `\n${tag}\n`;
  fs.writeFileSync(file, html);
  console.log('Installed universal review widget manager into public/admin.html');
} else {
  console.log('Universal review widget manager already installed.');
}
