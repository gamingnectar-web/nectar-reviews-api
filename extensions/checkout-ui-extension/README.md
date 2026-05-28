# Nectar Cart Rewards Checkout UI Extension Starter

Use this only when merchants want rewards to be claimable inside checkout as well as the cart drawer/cart page.

Important notes:

- Theme app extension blocks can render in the Online Store cart drawer/cart page.
- Checkout UI requires a Checkout UI extension target; do not try to inject theme Liquid into checkout.
- Adding a reward line in checkout uses `applyCartLinesChange` and can fail when Shopify says cart lines cannot be added, including some accelerated checkout flows.
- The Discount Function remains the checkout-safe price protection. This UI extension is only the selection surface.

Generate a real extension with Shopify CLI, then port `src/Checkout.jsx` into the generated scaffold if your package versions differ.
