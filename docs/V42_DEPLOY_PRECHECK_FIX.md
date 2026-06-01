# V42 deploy precheck fix

This package pins Render/Node to Node 22 LTS instead of allowing the platform to select the latest Node runtime.

Why: Render logs from previous deploys showed Node.js v26.x. This app is CommonJS and the dependency/runtime surface has been tested against the active LTS line. Pinning avoids deployment variance.

Changes:
- package.json `engines.node` set to `22.x`
- `.node-version` and `.nvmrc` added
- render.yaml `NODE_VERSION=22` added
- render.yaml build command changed to `npm ci && npm run deploy:preflight`
- `deploy:preflight` verifies local `require(...)` files and JS syntax before the service starts

If Render still fails, the next useful data is the first 30 lines above the failure in Render logs.
