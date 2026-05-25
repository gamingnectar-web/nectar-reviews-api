# Modular app structure

## Current products

| Product | Module id | Admin folder | Backend namespace |
|---|---|---|---|
| review-widget | `reviews` | `public/modules/reviews` placeholder | existing `/api` and `/api/admin` routes |
| Cart Milestone Rewards | `cart-rewards` | `public/modules/cart-rewards` | `/api/cart-rewards` |

## App shell files

`public/module-registry.js` lists the app products shown in the dropdown.

`public/module-shell.js` installs the product dropdown into the existing sidebar and loads module assets when selected.

`public/module-shell.css` styles the dropdown independently from any module.

## Backend module files

`src/modules/index.js` mounts folderised modules and exposes `/api/admin/modules`.

`src/modules/moduleRegistry.js` is the backend equivalent of the public module registry.

`src/modules/cart-rewards/index.js` mounts `/api/cart-rewards` and starts the scheduler.

`src/modules/reviews/index.js` is a shim that marks Reviews as the default module while existing review routes stay in place.

## Shopify app landing

The app should continue to use the same Shopify App URL:

```txt
https://your-app-url.com/admin
```

To land directly in a product workspace, use:

```txt
/admin?shop=store.myshopify.com&module=cart-rewards
/admin?shop=store.myshopify.com&module=reviews
```

The default remains Reviews.
