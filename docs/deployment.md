# Deployment

## Render

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Set the environment variables from `.env.example`.

## MongoDB

The app uses `CORE_DB_URI`. Without MongoDB, it will run in demo mode for module settings, but product data will not persist.

## Shopify OAuth

Set the app URL and redirect URLs in the Shopify Partner dashboard.

Allowed redirects:

```txt
https://nectar-reviews-api.onrender.com/auth/callback
https://nectar-reviews-api.onrender.com/auth/shopify/callback
https://nectar-reviews-api.onrender.com/api/auth/callback
```

OAuth install test:

```txt
https://nectar-reviews-api.onrender.com/auth/shopify?shop=your-store.myshopify.com
```
