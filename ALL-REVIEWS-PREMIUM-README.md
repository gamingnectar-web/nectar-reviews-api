# All Reviews SEO Page — premium redesign

This replaces the old sparse page with a search-led reviews discovery experience.

## Behaviour
- Premium hero with softly floating review silhouettes.
- Once approved reviews load, the background silhouettes use real approved review data.
- Large centred search field.
- Quick actions for product names, exact 5-star reviews, exact 1-star reviews, flavour/profile searches and recent reviews.
- Search supports product title, review copy, product tags and attribute labels/values through the existing SEO endpoint.
- Exact 1–5 star filtering is added to the API.
- Desktop filter rail plus responsive mobile layout.
- Review-linked recommendations.
- Existing JSON-LD review schema remains in place.
- Loading skeletons and a proper retry state replace the raw "Could not load reviews." message.

## Install
After extracting this overlay into the repo root:

    node scripts/install-all-reviews-premium.js
    node scripts/all-reviews-premium-smoke-test.js
    npm run deploy:preflight

Commit/push the backend changes to clean-main.

The Shopify theme app extension must also be deployed with Shopify CLI because GitHub/Render deployment does not itself publish extension asset changes.
