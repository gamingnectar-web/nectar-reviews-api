# ELEV8 Catalogue Audit + Brand Directory

Adds two new Product Creation & Import tabs:

- Site Audit
- Brand Directory

## Site Audit

Paste a supplier site or collection URL such as:

`https://x-zero.co.uk/collections/x-zero`

ELEV8:

1. discovers the supplier's product catalogue;
2. fetches product titles/handles from the supplier;
3. loads the Shopify catalogue;
4. matches products;
5. reports missing products, possible matches and existing products needing richer content;
6. checks whether a reusable brand profile exists;
7. proposes brand information using supplier evidence + existing Gaming Nectar product patterns;
8. lets the merchant create a missing-product batch directly from the audit.

## Brand Directory

Stores reusable brand-level information independently from individual product drafts:

- About Brand
- short description
- SEO title / description
- canonical Shopify vendor
- website
- product families and types
- common claims
- how-to-use / storage / warnings when evidence supports them
- source/evidence/confidence

The "Generate missing brands from Shopify" action enumerates existing Shopify vendors and
creates proposed brand records from the products already on GamingNectar.

## Safety

Supplier and AI data are proposals, not published storefront content.
Brand profiles begin as DRAFT.
Missing-product imports create the existing ELEV8 batch workflow, which creates Shopify products as drafts.

## Install

```bash
node scripts/install-elev8-catalogue-audit.cjs
node scripts/elev8-catalogue-audit-smoke.cjs
node --check src/modules/product-creation-import/catalogue-audit/catalogueAudit.service.js
node --check src/modules/product-creation-import/catalogue-audit/catalogueAudit.routes.js
node --check public/product-catalogue-audit.js
npm run deploy:preflight
```

Brand Directory profiles are injected as reusable context into future batch imports. They fill only blank broad defaults and never overwrite product-specific or merchant-edited values.
