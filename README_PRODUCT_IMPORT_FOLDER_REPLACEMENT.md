# Product Creation & Import — folder replacement bundle

Unzip this at the repository root and allow it to overwrite existing files.

This bundle intentionally contains only the deployment-sensitive folders/files for the Product Creation & Import cleanup, not a brand-new full repo clone:

- `public/product-creation-import-cleanup.css`
- `public/product-creation-import-cleanup.js`
- `src/app.js`
- `src/modules/product-creation-import/productCreationImport.model.js`
- `src/modules/product-creation-import/services/productImportSettings.service.js`
- `docs/PRODUCT_IMPORT_CLEANUP_CHANGELOG.md`

## What this does

- Adds a clear URL import scan/loading state.
- Adds a Source → Scan → Review → Draft workflow strip.
- Adds batch import status cards.
- Adds SKU-prefix settings.
- Defaults imported supplier SKUs to the first two vendor letters, e.g. `G FUEL + 12345 = GF-12345`.
- Lets merchants set a custom import SKU prefix instead.
- Adds smarter metafield review panels and moves low-use metafields visually lower.

## Deployment check

The JS files in this bundle have been checked with:

```bash
node --check public/product-creation-import-cleanup.js
node --check src/app.js
node --check src/modules/product-creation-import/productCreationImport.model.js
node --check src/modules/product-creation-import/services/productImportSettings.service.js
```

After copying the files, run:

```bash
npm run deploy:preflight
```

## Important

Do not upload the outer zip folder as a nested folder inside the repo. The files must land directly at repo root paths such as `public/...` and `src/...`.
