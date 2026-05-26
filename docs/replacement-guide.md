# Replacement guide

This repo is designed so you can replace whole folders.

## Safe replacement folders

```txt
src/modules/reviews
src/modules/loyalty
src/modules/discounts
src/modules/cart-rewards
src/modules/campaigns
src/modules/help
public/admin
Shopify-Liquid
```

## Foundation folders

Be careful when replacing these because they affect every product area:

```txt
src/core
src/config
src/app.js
server.js
package.json
```

## Example: replace reviews

```bash
rm -rf src/modules/reviews
unzip new-reviews-module.zip -d src/modules/
npm run structure
```

## Example: replace cart rewards

```bash
rm -rf src/modules/cart-rewards
unzip new-cart-rewards-module.zip -d src/modules/
npm run structure
```

## Adding a new module

1. Create a folder inside `src/modules/<module-key>`.
2. Add `module.config.js`.
3. Add `models`, `routes`, `services` and `admin` folders.
4. Import it in `src/core/module-registry/index.js`.
5. Add the key to `knownModuleKeys` in `src/core/settings/module-settings.service.js`.
