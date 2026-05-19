# Nectar Drops Stages 4-6 Wireframes

This document wires the next three stages around a privacy-first identity model:

- No customer email/name/address is needed for loyalty balances.
- The loyalty ledger is keyed by a shop-scoped `customerKey`.
- `customerKey = HMAC(CUSTOMER_ID_SECRET, shopDomain + Shopify customer ID)`.
- Public customer endpoints require a logged-in Shopify customer identity, normally through a signed app-proxy request or a customer-account extension session.

## Stage 4 - Customer landing page and balance widget

### Goal
Give shoppers a customer-facing Nectar Drops home where they can see how the scheme works, view their balance, and redeem points for one-use discount codes.

### Customer wireframe

```txt
/apps/nectar/loyalty

--------------------------------------------------
🍯 Nectar Drops
Earn rewards every time you shop.

[Signed-in state]
Your balance: 420 Drops
Customer ref: cust_a1b2c3d4e5

Ways to earn
- 5 Drops for every £1 spent
- 25 Drops after an approved review
- 50 Drops after an approved photo review

Ways to spend
- 500 Drops = £5 off
- 1,000 Drops = £10 off

[ Redeem Drops ] [ View activity ]

Recent activity
+125 Drops     Purchase reward
+25 Drops      Approved review
-500 Drops     Discount redemption
--------------------------------------------------

[Signed-out state]
Log in to view and redeem your Nectar Drops.
--------------------------------------------------
```

### Backend needed

```txt
GET  /api/loyalty/balance
POST /api/loyalty/redeem
```

The current package now protects these public endpoints with app-proxy signature verification and `logged_in_customer_id`. It does not accept email-based balance lookup.

### Storefront needed

```txt
public/loyalty/nectar-drops-widget.js
```

This can be loaded by a Shopify theme app block later. The secure production route should be an app proxy because Shopify signs proxy requests and includes the logged-in customer ID.

## Stage 5 - Customer account extension

### Goal
Make Nectar Drops feel native inside Shopify's customer accounts.

### Profile block wireframe

```txt
Customer account > Profile

🍯 Nectar Drops
You have 420 Drops
[Open rewards]
```

### Order status block wireframe

```txt
Order #1008

🍯 You earned 95 Nectar Drops from this order.
They will appear in your balance shortly.
```

### Full page wireframe

```txt
Customer account > Nectar Drops

Balance: 420 Drops
Redeemable value: £4

[ Redeem 400 Drops for £4 off ]

Activity
Date        Action              Drops
Today       Purchase reward     +95
Yesterday   Approved review     +25
Last week   Redeemed code       -400
```

### Extension files to build later

```txt
extensions/nectar-drops-customer-account/
  shopify.extension.toml
  package.json
  src/NectarDropsPage.jsx
```

The extension should call the backend using a customer-account identity token/session, not email.

## Stage 6 - Checkout redemption and Shopify Function

### Phase 6A - Safe default: discount-code redemption

```txt
Customer clicks "Redeem Drops"
Backend verifies logged-in customer identity
Backend checks customerKey balance
Backend creates one-use Shopify discount code
Backend deducts/reserves Drops
Customer applies code at checkout
Webhook later reconciles usage/refunds
```

This is the safest cross-plan version because it does not require checkout UI customisation.

### Phase 6B - Checkout UI block

```txt
Checkout

🍯 Nectar Drops
You have 420 Drops
Use 400 Drops for £4 off this order
[Apply Drops]
```

This is best treated as an advanced feature because checkout UI availability depends on the merchant's Shopify plan and checkout extensibility capabilities.

### Phase 6C - Shopify Function-backed redemption

```txt
MongoDB = source of truth
App mirrors redeemable points to a Shopify customer metafield
Discount Function reads customer/cart/metafield input
Function applies the discount
Order webhook reconciles points after checkout
```

Avoid requiring the Function to call MongoDB directly. Use Shopify metafields or function input where possible.

## Admin wireframe additions

```txt
Loyalty tab
- Enable Nectar Drops
- Points name/icon
- Purchase earning: X Drops per £1
- Product/variant/tag rules
- Review earning rules
- Redemption rules
- Landing page copy
- Security status: identity mode = hashed customer key

Customers tab later
- Customer ref only, not email/name
- Balance
- Lifetime earned/spent
- Manual adjustment by customer ref/customer ID
```
