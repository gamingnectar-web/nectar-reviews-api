const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const skipDirs = new Set(['node_modules', '.git']);
const jsFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(full);
  }
}

walk(root);

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Syntax check failed: ${path.relative(root, file)}`);
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`JavaScript syntax check passed (${jsFiles.length} files).`);
