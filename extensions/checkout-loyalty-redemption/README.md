# Loyalty checkout redemption beta extension

This is a beta checkout UI extension scaffold. It renders a logged-in customer's available loyalty points and can request a checkout redemption from the app API.

It is intentionally gated behind `settings.checkoutBeta.enabled` in the loyalty programme and should not be enabled for merchants until the Shopify extension is deployed and the discount issuing mode has been tested.

Required settings:

- `app_url`: your Render app URL
- `shop_domain`: the shop's permanent myshopify.com domain

The backend endpoint is `/api/loyalty/checkout/*`.
