# ELEV8 Product Import Integrity

Fixes the current importer problems:
- product flavour leaking/copying between products;
- manual SEO title/description being regenerated;
- About Brand not persisting reliably;
- AI confidence overwriting merchant edits.

The Shopify Admin API remains the source for catalogue data. OpenAI receives a relevant catalogue reference context and supplier evidence, then fills only blank/unlocked fields.

Install:
node scripts/install-elev8-import-integrity.cjs
node scripts/elev8-import-integrity-smoke.cjs
npm run deploy:preflight

No Shopify theme/app-extension deploy is required for this backend/admin importer update.
