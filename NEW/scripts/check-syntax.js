const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const root = path.join(__dirname, '..');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}
walk(root);
for (const file of files) {
  childProcess.execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log(`Checked ${files.length} JavaScript files.`);
