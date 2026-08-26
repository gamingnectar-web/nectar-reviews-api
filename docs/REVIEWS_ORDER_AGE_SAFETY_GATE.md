# Reviews old-order safety gate

Adds two merchant-configurable fail-safes to Reviews automation:

- **Order cutoff date** — orders placed before this date are marked `skipped` and can never receive a customer review request.
- **Maximum order age** — orders older than the configured number of days are marked `skipped`.

The rules are enforced at three layers:

1. when the Shopify fulfilment webhook creates the review-request job;
2. when an order later receives the delivery tag;
3. immediately before SMTP send, so existing queued jobs are also protected after settings change.

Test/proof jobs remain usable and do not send to real customers.
