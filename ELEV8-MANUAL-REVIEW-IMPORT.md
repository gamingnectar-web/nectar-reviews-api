# ELEV8 Manual Review Import

Adds a **Manual Add** button to Review Manager.

The modal mirrors the customer review form:
- Shopify product search
- review date
- reviewer name
- optional email
- optional order number
- 1–5 stars
- headline
- review body
- verified-buyer toggle
- Sourness / Sweetness / Flavour attributes

Use **+ Add another review** to build a bulk batch.

Saving does **not** publish reviews. Every manual review is created with:
- `source = manual`
- `status = pending`
- a shared `importBatchId`

The **Draft batches** tab lets an admin approve the whole batch only after checking the import.

Duplicate protection hashes product + reviewer + email + rating + review text + date and rejects the entire batch if an apparent duplicate already exists.

Install:

```bash
node scripts/install-elev8-manual-review-import.cjs
node scripts/elev8-manual-review-import-smoke.cjs
node --check src/routes/manualReviews.js
node --check public/manual-review-import.js
npm run deploy:preflight
```
