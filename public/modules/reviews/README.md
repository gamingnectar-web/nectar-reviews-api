# Reviews admin module folder

This folder is the landing zone for the existing review-widget admin code when you are ready to fully folderise Reviews.

The current integration keeps the existing root `public/admin.html` and `public/admin.js` working so the Reviews app does not break. The product switcher treats Reviews as the default module and routes Cart Rewards into `/public/modules/cart-rewards/`.

Recommended later move:

1. Move review-specific admin JS into `public/modules/reviews/admin.js`.
2. Move review-specific admin CSS into `public/modules/reviews/admin.css`.
3. Keep only the app shell, Shopify App Bridge setup, product switcher and shared helpers in root `public/admin.html` / `public/admin.js`.
4. Register the Reviews module in `public/module-registry.js` with its own `script` and `css` values.

This staged approach lets Cart Rewards be cleanly folderised now without risking the existing Reviews dashboard.
