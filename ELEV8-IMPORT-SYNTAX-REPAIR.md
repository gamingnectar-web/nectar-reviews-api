# ELEV8 importer syntax repair

Render failed because merchant-edit logic was inserted inside the destructured
parameter list of `updateBatchItem()`.

Run:

```bash
node scripts/repair-elev8-import-update-batch-item.cjs
node scripts/elev8-import-syntax-repair-smoke.cjs
node --check src/modules/product-creation-import/services/productImportBatch.service.js
npm run deploy:preflight
```
