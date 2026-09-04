# Require verifier deploy fix

Replace `scripts/verify-relative-requires.js` with the included version.

This prevents one-off installer/patch scripts from being treated as runtime modules by
the deployment preflight.

After copying:

```bash
node scripts/verify-relative-requires.js
npm run deploy:preflight
```
