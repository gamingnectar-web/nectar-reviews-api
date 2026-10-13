# ELEV8 browser identity — staged integration

This is a **staging-only initial implementation**, not a complete unified-identity production launch.
It adds an invited-user email magic-link browser sign-in with hashed one-time tokens, per-shop memberships, short or remembered revocable MongoDB sessions, and a conservative administrator-only write rule.

**Not yet completed:** Shopify staff identity-to-membership binding, granular existing-route authorization audit, distributed login request rate limiting, audit logging, secure token refresh/rotation, email provider configuration validation, login UI integration, and full automated integration tests. Do **not** enable this on live production until those are reviewed and tested.

## Install in Codespaces

1. Copy this directory into the repo or download the ZIP and extract it.
2. Run `python3 elev8-browser-auth/install.py` from the repository root (adapt path accordingly).
3. `node --check src/app.js && node --check src/modules/elev8BrowserAuth/index.js && npm run security:smoke && git diff --check`.
4. Review `git diff`; run integration tests in a staging instance before merging to the auto-deployed `clean-main`.

## Staging environment

- `ELEV8_BROWSER_LOGIN_ENABLED=true` (default off)
- `APP_URL=https://YOUR-STAGING-DOMAIN`
- `ELEV8_LOGIN_SMTP_URL=smtps://...` (secret; do not put in Git)
- `ELEV8_LOGIN_FROM=security@your-domain`
- existing MongoDB connection string

Invite owner from a secured terminal: `node scripts/elev8-invite.js gaming-nectar.myshopify.com person@example.com owner`
Then open `/elev8/login`. Session logout endpoint: `POST /elev8/logout`.

## Important access behaviour

- Existing Shopify embedded sessions are preserved to avoid lockouts, but **they are not yet enforced against the new per-user roles**.
- Browser-authenticated users may read existing admin APIs; only `owner` and `admin` can perform writes via the new browser session.
- Legacy admin authentication elsewhere must be reconciled to a common membership model before claiming unified permissions.
- Browser sessions are bound to the user agent, saved as hashes, and expire after 12 hours (or 30 days when remembered), but future security work should add rotation, revocation UI, rate limiting shared across instances, and auditing.
- Some internal route handlers may perform additional legacy authentication. Audit these before production enablement.
- The email-based link confirmation uses `POST` so link prefetchers do not consume the token.
