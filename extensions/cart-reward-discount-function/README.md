# Cart Reward Discount Function starter

This folder contains the checkout-safe discount protection layer.

The theme widget improves UX, but checkout pricing must be protected by a Shopify Discount Function.

## Important

Shopify Function generated Rust types are API-version-sensitive. After generating a Discount Function extension with Shopify CLI, copy the logic from `src/run.rs` into the generated scaffold and run type generation.

## Intended behaviour

- Inspect cart lines
- Find lines with `_nectar_reward=true`
- Read `_nectar_claim_token`
- Verify token signature
- Check campaign/tier/variant/quantity fields match the token payload
- Apply 100% product discount only to valid reward cart lines
- Ignore invalid/fake reward lines

## Configuration

Store a secret or verification key in the function owner discount metafield.

Example config JSON:

```json
{
  "rewardTokenSecret": "same-or-derived-secret-used-by-backend",
  "message": "Nectar reward"
}
```

If you do not want a shared secret in function config, replace HMAC verification with a public-key signature flow:
backend signs with private key, function verifies with public key.
