# Reviews real-order proof repair

This update changes Reviews proof emails to use a real non-test Shopify review-request job as their source.

Key safeguards:
- Proofs cannot be seeded from an earlier proof/test job.
- The proof retains the real order ID/name and real Shopify product IDs.
- The recipient is replaced with the locked shop proof email.
- Customer display names are masked.
- Product context is refreshed before the proof is sent.
- A proof is refused if no usable Shopify products remain.
- Proof results report product/image/tag/slider-rule diagnostics.
- Proof jobs remain testMode=true and cannot become verified/live reviews.
- Storefront product normalisation now has one authoritative metafield/slider assignment.
