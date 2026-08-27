# Reviews Platform security hardening

This overlay hardens the current clean-main without changing the Reviews product workflow.

## Included
- Exact allow-list for credentialed admin CORS; no blanket `*.myshopify.com` trust.
- Admin secrets/tokens accepted only through headers/cookies, never URL query strings.
- Origin check on cookie-authenticated admin write requests.
- HSTS and additional browser security headers.
- OAuth callback no longer places an admin token in the URL.
- Public DB health endpoint no longer exposes database names or env-variable names.
- Review POST size cap, honeypot handling, bounded tags, score-key allow-listing and 0–100 score range validation.
- Short-lived atomic MongoDB submission guard to stop concurrent duplicate review races.
- Security smoke tests included in deploy preflight.

## Atlas cutover still required
New least-privilege runtime users were created in Atlas. Do not remove the old users until Render has been switched to the new credentials and a health check plus a live test review have passed. The current `0.0.0.0/0` network rule must be removed only after Render's egress/private networking strategy is confirmed.
