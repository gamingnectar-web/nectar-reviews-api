const fs = require('fs');
const required = ['server.js','src/app.js','src/models/index.js','src/routes/public.js','src/routes/admin.js','src/routes/reviewMigrations.js','src/routes/aiEmailModules.js','public/admin.html','public/review-widget.js'];
const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length) throw new Error('Missing restore files: ' + missing.join(', '));
console.log('Restore verification passed.');
