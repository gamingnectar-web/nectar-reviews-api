# ELEV8 Marketing Intelligence + Creative Studio

A new first-class ELEV8 module.

## Marketing Intelligence
Ranks recently sold products using:
- 7-day vs 30-day sales momentum
- 30-day vs 183-day normalised sales pace
- 30-day revenue
- recent unit velocity
- known-cost gross margin
- approved review sentiment
- current Shopify inventory

The score is an operational marketing prioritisation aid, not a claim that a product will perform in a future campaign.

## Creative Studio
Select a recommended product, choose a premium visual style and generate a background with the existing OpenAI key.

ELEV8 instructs the image model to create the **background plate only**. It does not ask AI to redraw the product packaging. The browser composites the actual Shopify product image over the generated scene and allows the final PNG to be downloaded.

This MVP supports:
- Luxury studio
- Flavour-led premium
- Premium gaming
- Clean hydration
- Seasonal campaign
- Square, portrait and landscape formats

## Environment
Uses the existing `OPENAI_API_KEY`.
Optional: `OPENAI_IMAGE_MODEL`; defaults to `gpt-image-1`.

## Install
```bash
node scripts/install-elev8-marketing-intelligence-module.cjs
node scripts/elev8-marketing-intelligence-smoke.cjs
node --check src/modules/marketing-intelligence/index.js
node --check src/modules/marketing-intelligence/marketingIntelligence.routes.js
node --check src/modules/marketing-intelligence/marketingIntelligence.service.js
node --check public/modules/marketing-intelligence/marketing-intelligence.js
npm run deploy:preflight
```
