require('dotenv').config();

// Render/Git safety guard: this app relies on src/utils/validation.js in many routes.
// If a deploy accidentally omits that utility file, restore it before loading src/app
// so the service starts instead of crashing with MODULE_NOT_FOUND.
const fs = require('fs');
const path = require('path');

function ensureCoreUtilityFiles() {
  const utilsDir = path.join(__dirname, 'src', 'utils');
  const validationFile = path.join(utilsDir, 'validation.js');

  if (fs.existsSync(validationFile)) return;

  fs.mkdirSync(utilsDir, { recursive: true });
  fs.writeFileSync(validationFile, String.raw`function cleanShopDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function isValidShopDomain(value) {
  const shop = cleanShopDomain(value);
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) || /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(shop);
}

function cleanText(value, max = 1000) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, max);
}

function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function cleanReviewStatus(value) {
  const allowed = new Set(['pending', 'accepted', 'rejected', 'hold', 'spam']);
  const status = String(value || '').toLowerCase();
  return allowed.has(status) ? status : null;
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || '';
}

module.exports = {
  cleanShopDomain,
  isValidShopDomain,
  cleanText,
  cleanEmail,
  clampNumber,
  cleanReviewStatus,
  getClientIp,
};
`);
  console.warn('Restored missing core utility file: src/utils/validation.js');
}

ensureCoreUtilityFiles();

const app = require('./src/app');
const { connectDb } = require('./src/config/db');
const { env } = require('./src/config/env');
const { startPlatformModuleJobs } = require('./src/modules');

async function start() {
  await connectDb();
  startPlatformModuleJobs();
  app.listen(env.port, () => {
    console.log(`✅ Reviews Platform API running on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error('❌ Failed to start Reviews Platform API:', error);
  process.exit(1);
});
