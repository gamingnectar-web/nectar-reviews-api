#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ ! -f "${REPO_ROOT}/src/app.js" ] || [ ! -f "${REPO_ROOT}/src/models/index.js" ]; then
  echo "Run this from the nectar-reviews-api repo root, or pass the repo root as the first argument." >&2
  exit 1
fi

mkdir -p "${REPO_ROOT}/src/routes" "${REPO_ROOT}/src/models" "${REPO_ROOT}/src/services" "${REPO_ROOT}/public"
cp "${PACKAGE_ROOT}/src/routes/reviewMigrations.js" "${REPO_ROOT}/src/routes/reviewMigrations.js"
cp "${PACKAGE_ROOT}/src/models/reviewMigrationModels.js" "${REPO_ROOT}/src/models/reviewMigrationModels.js"
cp "${PACKAGE_ROOT}/src/services/reviewMigrationService.js" "${REPO_ROOT}/src/services/reviewMigrationService.js"
cp "${PACKAGE_ROOT}/public/admin-review-migrations.js" "${REPO_ROOT}/public/admin-review-migrations.js"

node <<'NODE' "${REPO_ROOT}"
const fs = require('fs');
const path = require('path');
const root = process.argv[1];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, content) { fs.writeFileSync(path.join(root, file), content); }

let app = read('src/app.js');
if (!app.includes("require('./routes/reviewMigrations')")) {
  app = app.replace("const taskRoutes = require('./routes/tasks');", "const taskRoutes = require('./routes/tasks'); const reviewMigrationRoutes = require('./routes/reviewMigrations');");
}
if (!app.includes("/api/admin/review-migrations")) {
  app = app.replace("app.use('/api/admin', adminRoutes);", "app.use('/api/admin/review-migrations', reviewMigrationRoutes); app.use('/api/admin', adminRoutes);");
}
write('src/app.js', app);

let models = read('src/models/index.js');
if (!models.includes('reviewScope: { type: String')) {
  models = models.replace(
    "itemId: { type: String, required: true, index: true },",
    "itemId: { type: String, required: true, index: true }, reviewScope: { type: String, enum: ['product', 'site'], default: 'product', index: true }, productHandle: { type: String, default: '', index: true }, productTitle: { type: String, default: '' }, productUrl: { type: String, default: '' }, externalProductId: { type: String, default: '', index: true },"
  );
}
if (!models.includes('duplicateHash: { type: String')) {
  models = models.replace(
    "comment: { type: String, default: '' },",
    "comment: { type: String, default: '' }, media: { type: [mongoose.Schema.Types.Mixed], default: [] }, sourceUrl: { type: String, default: '' }, duplicateHash: { type: String, default: '', index: true }, importedAt: { type: Date, default: null },"
  );
}
if (!models.includes("reviewSchema.index({ shopDomain: 1, reviewScope: 1, status: 1 })")) {
  models = models.replace(
    "reviewSchema.index({ shopDomain: 1, itemId: 1, status: 1 });",
    "reviewSchema.index({ shopDomain: 1, itemId: 1, status: 1 }); reviewSchema.index({ shopDomain: 1, reviewScope: 1, status: 1 }); reviewSchema.index({ shopDomain: 1, sourcePlatform: 1, externalReviewId: 1 }); reviewSchema.index({ shopDomain: 1, duplicateHash: 1 });"
  );
}
write('src/models/index.js', models);

let publicRoutes = read('src/routes/public.js');
if (!publicRoutes.includes("router.get('/site-reviews'")) {
  const siteRoute = "router.get('/site-reviews', async (req, res, next) => { try { const shopDomain = cleanShopDomain(req.query.shopDomain || req.query.shop); if (!shopDomain || !isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'Valid shopDomain is required.' }); const limit = clampNumber(req.query.limit, 1, 50, 20); const reviews = await Review.find(liveReviewMatch({ shopDomain, $or: [{ reviewScope: 'site' }, { itemId: '__site__' }] })).sort({ createdAt: -1 }).limit(limit).lean(); return res.json(reviews.map(normaliseReviewForPublic)); } catch (error) { next(error); } }); ";
  publicRoutes = publicRoutes.replace("router.get('/global-reviews'", `${siteRoute}router.get('/global-reviews'`);
}
write('src/routes/public.js', publicRoutes);

let adminHtml = read('public/admin.html');
if (!adminHtml.includes('/admin-review-migrations.js')) {
  const tag = '<script src="/admin-review-migrations.js"></script>';
  if (adminHtml.includes('</body>')) adminHtml = adminHtml.replace('</body>', `${tag}\n</body>`);
  else adminHtml += `\n${tag}\n`;
}
write('public/admin.html', adminHtml);
NODE

node --check "${REPO_ROOT}/src/routes/reviewMigrations.js"
node --check "${REPO_ROOT}/src/models/reviewMigrationModels.js"
node --check "${REPO_ROOT}/src/services/reviewMigrationService.js"
node --check "${REPO_ROOT}/public/admin-review-migrations.js"
node --check "${REPO_ROOT}/src/app.js"
node --check "${REPO_ROOT}/src/models/index.js"
node --check "${REPO_ROOT}/src/routes/public.js"

echo "Review Migration Centre update applied. Run git diff and test the admin page before deploying."
