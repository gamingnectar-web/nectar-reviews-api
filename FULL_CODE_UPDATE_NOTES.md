# Nectar Reviews API full code update

This archive is the uploaded clean-main repository with the Product Creation & Import batch workspace merged in.

## What changed

- Added batch product import routes under `/api/admin/product-creation-import/batches`.
- Added `ProductImportBatch` Mongo model.
- Added services for batch scanning, image scoring, nutrition/flavour extraction and schema-based metafield mapping.
- Added embedded admin Batch Import tab inside Product Creation & Product Import.
- Added standalone batch UI at `/modules/product-creation-import/index.html`.

## Install

This archive intentionally does not include `node_modules`. After replacing the code, run:

```bash
nvm use 22 || true
npm install
npm run check
npm start
```

If your terminal shows Node 24, use `nvm install 22 && nvm use 22` first.
