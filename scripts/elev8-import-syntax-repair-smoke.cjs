const fs = require('fs');
const assert = require('assert');

const file = 'src/modules/product-creation-import/services/productImportBatch.service.js';
const src = fs.readFileSync(file, 'utf8');

assert.ok(
  src.includes('async function updateBatchItem({ shopDomain, batchId, itemId, patch = {} }) {'),
  'updateBatchItem has a valid destructured signature'
);
assert.ok(
  !src.includes('async function updateBatchItem({\n  if (patch?.draft'),
  'broken logic is no longer inside the parameter list'
);
assert.ok(
  src.includes('markMerchantEdits(itemPreview.draft || {}, patch.draft)'),
  'merchant edit protection remains active'
);

console.log('✓ updateBatchItem signature valid');
console.log('✓ malformed destructuring removed');
console.log('✓ merchant edit protection retained');
console.log('ELEV8 importer syntax repair smoke passed: 3 checks');
