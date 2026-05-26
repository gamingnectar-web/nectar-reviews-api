# Shopify iframe connection fix

This release fixes Shopify Admin iframe loading without changing product logic.

## Why

Helmet sets `X-Frame-Options: SAMEORIGIN` by default. Shopify embedded apps are loaded inside `admin.shopify.com`, so that default browser header can produce a browser message such as `nectar-reviews-api.onrender.com refused to connect`.

## What changed

- Disabled Helmet frameguard only.
- Added a `Content-Security-Policy: frame-ancestors ...` header.
- When a `shop` query/header is present, the header is shop-specific: `https://{shop}.myshopify.com https://admin.shopify.com`.
- When no shop is present, the fallback allows Shopify admin and myshopify shop domains.

## What did not change

- Reviews logic
- Loyalty logic
- Discount logic
- Cart reward logic
- Campaign logic
- Mongo models
- Shopify auth flow
- Liquid block logic
