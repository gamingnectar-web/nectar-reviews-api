# Nectar Reviews API — Secure Modular Codebase

This is a complete replacement codebase for the Nectar Reviews Shopify app foundation.

It is organised as:

```txt
server.js
src/
  core/
    app.js
    database.js
    config.js
    audit/
    http/
    modules/
    security/
    shopify/
  modules/
    reviews/
    messaging/
    discounts/
    loyalty/
    help/
  admin/
    pages/
    assets/
public/
  widget/
  loyalty/
extensions/
  nectar-drops-customer-account/
  nectar-drops-checkout/
  nectar-drops-discount-function/
docs/
```

## What this version covers

- Reviews module with public widgets, one-use review request links, moderation, replies, soft delete, analytics and Shopify metafield sync.
- Messaging module with encrypted SMTP settings, review request emails, and campaign tracking with hashed identifiers.
- Discounts module with accepted-review reward codes.
- Loyalty module named **Nectar Drops**.
- Merchant-configurable loyalty earning and redemption rules.
- Delayed point approval after order paid, fulfillment, delivery, immediate approval or manual approval.
- Pending / approved / spent / reversed point ledger.
- Refund/cancellation reversal hooks.
- Customer-facing balance and redemption endpoints through signed Shopify app proxy requests.
- Audit event logging for traceability.
- No raw loyalty customer email, name, address, phone or Shopify customer ID stored.
- Raw discount codes are not stored long-term; the app stores hashes and previews.

## Required Render variables

Keep your existing variables if they are already set:

```txt
MONGODB_URI
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_SCOPES
SHOPIFY_API_VERSION
APP_BASE_URL
EMAIL_CREDENTIAL_SECRET
```

Add these:

```txt
NODE_ENV=production
ADMIN_AUTH_MODE=shopify_session
ADMIN_API_SECRET=<optional break-glass/dev fallback, not shown in merchant UI>
ADMIN_SESSION_SECRET=<optional long random session secret>
CUSTOMER_ID_SECRET=<long random secret; do not change later>
AUDIT_HASH_SECRET=<long random secret>
CRON_SECRET=<long random secret>
ALLOW_INSECURE_CUSTOMER_LOOKUP=false
```

Optional but recommended:

```txt
MONGODB_AUDIT_URI=<separate audit MongoDB connection string>
```

If `MONGODB_AUDIT_URI` is not set, audit events are written to a separate database name, `nectar_audit`, on the same MongoDB connection.

## Shopify scopes

Use at least:

```txt
read_products,read_orders,write_products,write_discounts
```

`write_discounts` is required for review reward and Nectar Drops redemption codes.

## Important security standards in this codebase

### Customer identity

Nectar Drops does not store raw Shopify customer IDs.

Instead:

```txt
customerKey = HMAC_SHA256(CUSTOMER_ID_SECRET, shopDomain + ':' + shopifyCustomerId)
```

This means a customer can only be resolved in the context of the store they are logged into.

### Loyalty data minimisation

The loyalty collections do not store:

```txt
customer email
customer name
address
phone number
raw Shopify customer ID
```

They store:

```txt
shopDomain
customerKey
customerRef
approvedPoints
pendingPoints
ledger transactions
redemption references
```

### Review request links

Review request links are one-use by default and expire. They store hashed customer/order/email references rather than raw customer PII.

### Audit logs

Audit logs are append-only event records for traceability. They store hashed actor/IP/user-agent data, not raw personal data.

### Webhooks

Shopify webhooks are mounted before `express.json()` so HMAC verification uses the raw request body.

### App proxy customer routes

Customer loyalty routes require:

- a valid Shopify app proxy signature
- `logged_in_customer_id`

Set `ALLOW_INSECURE_CUSTOMER_LOOKUP=false` in production.

## Key routes

### Admin

```txt
GET  /admin?shop=your-shop.myshopify.com
GET  /api/admin/modules
PUT  /api/admin/modules
GET  /api/admin/audit
```

Admin API calls require:

```txt
X-Nectar-Admin-Token: ADMIN_API_SECRET
```

### Reviews

```txt
GET    /api/reviews?shopDomain=&itemId=
POST   /api/reviews
GET    /api/admin/reviews
PATCH  /api/admin/reviews/:id/status
DELETE /api/admin/reviews/:id
GET    /review?token=<review request token>
```

### Discounts

```txt
GET /api/admin/discounts/settings
PUT /api/admin/discounts/settings
GET /api/admin/discounts/review-rewards
```

### Loyalty admin

```txt
GET    /api/admin/loyalty/overview
GET    /api/admin/loyalty/settings
PUT    /api/admin/loyalty/settings
GET    /api/admin/loyalty/rules
POST   /api/admin/loyalty/rules
PUT    /api/admin/loyalty/rules/:id
DELETE /api/admin/loyalty/rules/:id
GET    /api/admin/loyalty/accounts
GET    /api/admin/loyalty/transactions
GET    /api/admin/loyalty/redemptions
POST   /api/admin/loyalty/process-pending
```

### Loyalty customer

These should be accessed through a Shopify app proxy, not directly:

```txt
GET  /api/loyalty/balance
POST /api/loyalty/redeem
```

### Loyalty worker

```txt
POST /api/system/loyalty/process-pending
X-Nectar-Cron-Token: CRON_SECRET
```

Use this from a Render cron job or another scheduler to approve eligible pending Drops.

### Shopify webhooks

Configure Shopify webhooks to point at:

```txt
POST /api/webhooks/shopify/orders-paid
POST /api/webhooks/shopify/orders-cancelled
POST /api/webhooks/shopify/refunds-create
POST /api/webhooks/shopify/fulfillments-create
```

## Loyalty rule examples

### Earn 5 Drops per £1 spent

```json
{
  "ruleType": "earn",
  "trigger": "order_paid",
  "name": "Earn Drops on purchases",
  "enabled": true,
  "conditions": { "minimumSpend": 0, "useTotalPrice": false },
  "reward": { "mode": "points_per_currency", "pointsPerCurrency": 5, "roundMode": "floor" },
  "delay": { "mode": "after_order_paid", "days": 14 },
  "limits": { "maxUsesPerCustomer": 0, "maxPointsPerEvent": 0 }
}
```

### Spend over £50 bonus

```json
{
  "ruleType": "earn",
  "trigger": "order_paid",
  "name": "Spend over £50 bonus",
  "enabled": true,
  "conditions": { "minimumSpend": 50, "useTotalPrice": false },
  "reward": { "mode": "fixed_points", "points": 300 },
  "delay": { "mode": "after_order_paid", "days": 14 }
}
```

### Redeem 500 Drops for £5 off

```json
{
  "ruleType": "redeem",
  "trigger": "customer_redeem",
  "name": "£5 off voucher",
  "enabled": true,
  "conditions": { "minimumSpend": 0 },
  "reward": {
    "discountType": "fixed_amount",
    "pointsCost": 500,
    "amount": 5,
    "currency": "GBP",
    "codePrefix": "DROPS",
    "expiresAfterDays": 30
  },
  "delay": { "mode": "immediate", "days": 0 }
}
```

## Deployment checklist

1. Replace the repo contents with this codebase.
2. Add the required environment variables in Render.
3. Deploy.
4. Open `/health`.
5. Open `/admin?shopDomain=your-shop.myshopify.com`.
6. Enter `ADMIN_API_SECRET` in the admin token field.
7. Enable `discounts` and `loyalty` modules.
8. Load Nectar Drops overview once; this seeds default loyalty rules.
9. Configure Shopify webhooks.
10. Configure app proxy for customer loyalty page.
11. Configure Render cron for `/api/system/loyalty/process-pending`.

## Checks run before packaging

```txt
npm run check
npm audit --omit=dev
```

At packaging time, JavaScript syntax checks passed and npm audit reported zero vulnerabilities.


## Browser MongoDB bootstrap

If you cannot install `mongosh`, use the built-in secure setup page after deploying to Render.

1. Set `DATABASE_BOOTSTRAP_SECRET` in Render. Use a long random value.
2. Set `DISABLE_DATABASE_BOOTSTRAP=false` for the first deployment.
3. Visit `/setup/bootstrap` on your Render app.
4. Enter the secret and type `CREATE_DATABASES`.
5. Confirm the databases appear in MongoDB Atlas.
6. Set `DISABLE_DATABASE_BOOTSTRAP=true` and restart the Render service.

The setup page creates the segmented MongoDB databases, collections, indexes, TTL retention rules, and starter Nectar Drops rules. See `docs/BROWSER_DATABASE_BOOTSTRAP.md`.


## Storefront widget URLs

The API root `/` should return a JSON status payload. The canonical review widget script is:

```txt
https://YOUR-RENDER-APP.onrender.com/widget/reviews-widget.js
```

The script works on Shopify storefronts because it derives the API origin from the script URL. If you embed it manually, use:

```liquid
<div
  data-nectar-reviews-widget
  data-shop-domain="{{ shop.permanent_domain }}"
  data-item-id="{{ product.id }}"
  data-api-base="https://YOUR-RENDER-APP.onrender.com">
  Loading reviews…
</div>
<script src="https://YOUR-RENDER-APP.onrender.com/widget/reviews-widget.js" defer></script>
```

If the widget does not show, check these in order:

1. `/health` returns OK.
2. `/widget/reviews-widget.js` loads in the browser.
3. `/api/reviews/summary?shopDomain=YOUR-SHOP.myshopify.com&itemId=PRODUCT_ID` returns JSON.
4. The product template includes a Nectar Reviews block/snippet.
5. The item ID used by submitted reviews matches the item ID used by the widget.
