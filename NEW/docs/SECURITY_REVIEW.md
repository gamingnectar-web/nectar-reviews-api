# Security Review

## Summary

This codebase has been rebuilt around data minimisation, shop-scoped identities, raw-body webhook verification, customer login requirements, and append-only audit logging.

## Data minimisation

The loyalty system does not store raw customer personal data.

Avoided fields:

- customer email
- customer name
- address
- phone number
- raw Shopify customer ID

Stored fields:

- shopDomain
- customerKey: HMAC-SHA256(shopDomain + Shopify customer ID)
- customerRef: public truncated reference
- point balances
- point ledger transactions
- redemption references

## Customer identity

A customer is only resolved when Shopify supplies a trusted identity, such as a signed app proxy request with `logged_in_customer_id`.

The customer key is calculated as:

```txt
HMAC_SHA256(CUSTOMER_ID_SECRET, shopDomain + ':' + shopifyCustomerId)
```

This means the same Shopify customer ID produces different records across different stores.

## App proxy protection

Customer-facing loyalty endpoints require:

- valid Shopify app proxy signature
- logged_in_customer_id

Production should use:

```txt
ALLOW_INSECURE_CUSTOMER_LOOKUP=false
```

## Webhook protection

Shopify webhooks are mounted before `express.json()`, and the raw body is used for HMAC verification.

Covered routes:

- orders paid
- orders cancelled
- refunds create
- fulfillments create

## Discount codes

Review reward and loyalty redemption discount codes are shown only at issue time. The database stores:

- discountCodeHash
- discountCodePreview
- Shopify discountId

It does not store raw discount codes long-term.

## Audit logging

Audit events can be written to a separate MongoDB database with:

```txt
MONGODB_AUDIT_URI
```

Audit records store hashed actor, IP, and user-agent data.

Tracked examples:

- module changes
- review status changes
- review deletion
- discount settings changes
- loyalty settings changes
- loyalty rule create/update/delete
- pending Drops approvals
- manual Drops adjustments
- Shopify webhook receipt

## Admin API protection

All `/api/admin/*` routes require:

```txt
X-Nectar-Admin-Token: ADMIN_API_SECRET
```

This is suitable for the current controlled admin foundation. A future embedded Shopify app version should replace this with proper Shopify session-based staff identity so audit logs can record specific staff actors.

## Rate limiting

A lightweight in-memory rate limiter is applied to API routes. For large multi-instance production deployments, replace or supplement this with Redis-backed rate limiting.

## Secrets that must not change after production use

Do not rotate these without a migration plan:

```txt
CUSTOMER_ID_SECRET
EMAIL_CREDENTIAL_SECRET
AUDIT_HASH_SECRET
```

Changing `CUSTOMER_ID_SECRET` would break existing customer loyalty account lookups. Changing `EMAIL_CREDENTIAL_SECRET` would prevent stored SMTP passwords from decrypting.

## Known limitations / future hardening

- Replace shared admin token with embedded Shopify admin session authentication.
- Add Redis-backed rate limiting for multi-instance deployments.
- Add automated dependency scanning in CI.
- Add automated integration tests using Shopify webhook fixtures.
- Add data retention policies for audit events and campaign tracking.
- Add GDPR/customer data erasure endpoints before public app review.
