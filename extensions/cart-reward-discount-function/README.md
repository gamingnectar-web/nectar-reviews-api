# Cart Reward Discount Function starter

This folder contains the checkout-safe discount protection layer for Cart Rewards.

The theme widget improves UX, but checkout pricing should be protected by a Shopify Discount Function.

Intended behaviour:

- Inspect cart lines
- Find lines with `_nectar_reward=true`
- Read `_nectar_claim_token`
- Verify token signature
- Check campaign, tier, variant and quantity fields match the token payload
- Apply a 100% product discount only to valid reward cart lines
- Ignore invalid/fake reward lines

This scaffold is deliberately conservative. Generate a fresh Shopify Function using Shopify CLI, then port this logic into the generated scaffold for your chosen API version.
