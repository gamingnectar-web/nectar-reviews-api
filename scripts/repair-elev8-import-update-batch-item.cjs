const fs = require('fs');
const path = require('path');

const file = path.join(
  process.cwd(),
  'src',
  'modules',
  'product-creation-import',
  'services',
  'productImportBatch.service.js'
);

if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

let src = fs.readFileSync(file, 'utf8');

const broken = `async function updateBatchItem({
  if (patch?.draft && typeof patch.draft === 'object') {
    const batchPreview = await ProductImportBatch.findOne({ _id: batchId, shopDomain }).lean();
    const itemPreview = batchPreview?.items?.find(row => row.itemId === itemId);
    if (itemPreview) patch = { ...patch, draft: markMerchantEdits(itemPreview.draft || {}, patch.draft) };
  }
 shopDomain, batchId, itemId, patch = {} }) {`;

const fixed = `async function updateBatchItem({ shopDomain, batchId, itemId, patch = {} }) {
  if (patch?.draft && typeof patch.draft === 'object') {
    const batchPreview = await ProductImportBatch.findOne({ _id: batchId, shopDomain }).lean();
    const itemPreview = batchPreview?.items?.find((row) => row.itemId === itemId);
    if (itemPreview) {
      patch = {
        ...patch,
        draft: markMerchantEdits(itemPreview.draft || {}, patch.draft),
      };
    }
  }`;

if (src.includes(broken)) {
  src = src.replace(broken, fixed);
} else if (
  src.includes('async function updateBatchItem({ shopDomain, batchId, itemId, patch = {} }) {')
) {
  console.log('✓ updateBatchItem signature already repaired.');
} else {
  throw new Error(
    'Could not find the exact malformed updateBatchItem signature. Stop rather than applying an unsafe replacement.'
  );
}

fs.writeFileSync(file, src);
console.log('✓ Repaired updateBatchItem function signature and merchant-edit hook.');
