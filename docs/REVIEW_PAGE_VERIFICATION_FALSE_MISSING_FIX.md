# Review page verification false-missing fix

This update fixes the review-link defaults panel incorrectly reporting that `/pages/leave-a-review` or `/pages/leave-review` is missing when the page already exists.

## What changed

- Shopify Admin page verification now tries common review-page handle aliases, including `leave-review` and `leave-a-review`.
- Public storefront checks now try the shop primary domain first where Shopify Admin can provide it, instead of relying only on the `.myshopify.com` host.
- If the app does not have page-read scope, the check now returns `warning` instead of falsely returning `missing` based only on a public storefront check.
- Warning state no longer implies the email/template link is broken. The UI now states that saved templates and email links still use the entered handle.
- The create-page action no longer tries to create a duplicate page when a page is publicly reachable or when the app cannot prove the page is missing.
- Saved review-page test templates now retain the chosen review page handle and link mode, then restore them when the template is loaded.

## Why this was happening

The old checker trusted a public request to:

```text
https://<shop>.myshopify.com/pages/<handle>
```

If that host returned a 404, password-page, redirect, or theme-level fallback, the app marked the page as missing even when the page existed on the live storefront or could not be checked because the installed token did not have page-read access.

## Files changed

- `src/routes/admin.js`
- `public/admin-messaging-campaigns.js`
- `docs/REVIEW_PAGE_VERIFICATION_FALSE_MISSING_FIX.md`

## Validation

Ran successfully:

```bash
npm ci --ignore-scripts
npm run check
npm audit --audit-level=moderate
```

Result:

```text
Cart Rewards smoke test loader OK: true
found 0 vulnerabilities
```
