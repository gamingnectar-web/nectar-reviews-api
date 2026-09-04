const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const ignoredDirs = new Set([
  'node_modules',
  '.git',
]);

const ignoredFiles = new Set([
  'install-all-reviews-refinement.js',
  'install-all-reviews-v4-hotfix.js',
  'install-all-reviews-v51-repair.js',
]);

const missing = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(path.join(dir, entry.name));
      }
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      !ignoredFiles.has(entry.name)
    ) {
      checkFile(path.join(dir, entry.name));
    }
  }
}

function existsAsRequireTarget(base) {
  const candidates = [
    base,
    `${base}.js`,
    `${base}.json`,
    path.join(base, 'index.js'),
  ];

  return candidates.some((candidate) => fs.existsSync(candidate));
}

function checkFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const requirePattern = /require\(['"](\.{1,2}\/[^'"]+)['"]\)/g;

  let match;

  while ((match = requirePattern.exec(source))) {
    const specifier = match[1];
    const target = path.resolve(path.dirname(file), specifier);

    if (!existsAsRequireTarget(target)) {
      missing.push(`${path.relative(root, file)} -> ${specifier}`);
    }
  }
}

walk(root);

if (missing.length) {
  console.error('Relative require verification failed. Missing local modules:');

  for (const item of missing) {
    console.error(`- ${item}`);
  }

  process.exit(1);
}

console.log('Relative require verification passed.');
