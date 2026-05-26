# Full repo restore package

This package is a full replacement repo, not a patch.

It restores the full admin surface that was lost when the repo was replaced by a bare modular scaffold:

- Dashboard
- Review Manager
- Approval rules
- Trash
- One-use review links
- Messaging & Campaigns
- Import CSV
- Rules & Settings
- Visual Customiser
- Module Access
- Discounts
- Loyalty
- Cart Rewards
- Documentation
- Manual Setup

The backend remains modular:

- `src/core` contains shared platform logic.
- `src/modules/reviews` contains reviews logic.
- `src/modules/loyalty` contains loyalty logic.
- `src/modules/discounts` contains discounts logic.
- `src/modules/cart-rewards` contains cart rewards logic.
- `src/modules/campaigns` contains campaign logic.
- `src/modules/help` contains support/help logic.

The Shopify iframe fix is retained in `src/app.js` by allowing Shopify Admin in the `frame-ancestors` Content Security Policy and disabling Helmet frameguard.

## Restore steps

From an empty GitHub Codespace/repo root:

```bash
unzip nectar-full-repo-restored.zip -d .
npm install
npm run check
npm start
```

Make sure the repo root contains `package.json` and `server.js` directly. Do not upload a wrapper folder as the repo root.

## Render

Start command:

```bash
npm start
```

Health check:

```txt
/health
```
