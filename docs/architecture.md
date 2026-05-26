# Architecture

The app is split into two layers:

1. **Core platform**: stable systems shared by every module.
2. **Product modules**: replaceable folders for reviews, loyalty, discounts, cart rewards, campaigns and help.

```txt
server.js
src/app.js
src/config/
src/core/
src/modules/
public/admin/
```

## Core platform

`src/core` contains shared logic:

- `auth`: Shopify OAuth.
- `settings`: per-shop module toggles.
- `module-registry`: registers module routes and admin assets.
- `shopify`: saved shops, OAuth token lookup and product search.
- `support`: shared support requests.
- `middleware`: request helpers.
- `utils`: hashing and shop-domain utilities.

## Product modules

Every product module follows this shape:

```txt
src/modules/example/
  module.config.js
  models/
  routes/
  services/
  admin/
    example.html
    example.js
    example.css
```

`module.config.js` is the contract between the module and the app shell.

## Module toggles

The admin shell asks:

```txt
GET /api/core/settings/modules?shop=example.myshopify.com
```

The API returns all module metadata plus enabled flags. Disabled modules are hidden from the admin and protected by API middleware.
