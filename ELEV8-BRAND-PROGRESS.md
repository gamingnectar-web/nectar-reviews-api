# ELEV8 Brand Scrape Progress

Adds a real background brand-scrape job and activity modal.

Actual backend stages shown:
- Preparing brand scan
- Discovering supplier catalogue
- Reading product data
- Grouping core product lines
- Generating brand intelligence
- Saving to MongoDB
- Complete / failed

The modal shows live counts and a phone-style activity feed.

Install:
```bash
node scripts/install-elev8-brand-progress.cjs
node scripts/elev8-brand-progress-smoke.cjs
node --check src/modules/product-creation-import/catalogue-audit/brandScrapeJob.service.js
node --check src/modules/product-creation-import/catalogue-audit/brandScrape.service.js
node --check public/brand-scrape-progress.js
npm run deploy:preflight
```
