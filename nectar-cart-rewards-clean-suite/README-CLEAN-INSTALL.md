# Clean Cart Rewards Replacement Installer

This package is for replacing the Cart Rewards module files cleanly.

It does **not** delete the whole repo.
It does **not** delete the existing Reviews product.
It removes old Cart Rewards-owned files first, backs them up, then installs fresh versions.

Run from repo root:

```bash
rm -rf nectar-cart-rewards-clean-suite
unzip -o nectar-cart-rewards-clean-suite.zip
node nectar-cart-rewards-clean-suite/install-clean-cart-rewards-suite.js
npm install
npm run check
npm run cart-rewards:smoke
```

Commit:

```bash
git add .
git commit -m "Clean replace cart rewards module"
git push
```

If anything is wrong, recover from Git or from `.nectar-backups/cart-rewards-clean-*/`.
