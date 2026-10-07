#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(pwd)}"
PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "=============================================================="
echo " ELEV8 Automations — Workflow Companion replacement v1.0.0"
echo "=============================================================="

test -f src/app.js || { echo "Run this from the ELEV8 / nectar-reviews-api repository root." >&2; exit 1; }
test -f src/routes/admin.js || { echo "Missing src/routes/admin.js" >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".elev8-workflows-backup-$STAMP"
mkdir -p "$BACKUP"
cp src/app.js "$BACKUP/app.js"
cp src/routes/admin.js "$BACKUP/admin.js"
test -f public/admin.html && cp public/admin.html "$BACKUP/admin.html" || true

echo "Installing module files..."
mkdir -p src/modules/workflows public/modules/workflows scripts docs
cp -R "$PKG_DIR/src/modules/workflows/." src/modules/workflows/
cp -R "$PKG_DIR/public/modules/workflows/." public/modules/workflows/
cp "$PKG_DIR/public/elev8-workflows-nav.js" public/elev8-workflows-nav.js
cp "$PKG_DIR/scripts/workflows-smoke-test.js" scripts/workflows-smoke-test.js
cp "$PKG_DIR/docs/ELEV8-WORKFLOWS.md" docs/ELEV8-WORKFLOWS.md

python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys, re

root = Path(sys.argv[1])
app = root / "src/app.js"
admin = root / "src/routes/admin.js"
html = root / "public/admin.html"

app_text = app.read_text(encoding="utf-8")
admin_text = admin.read_text(encoding="utf-8")

# Public REST trigger endpoint + worker.
require_line = "const elev8Workflows = require('./modules/workflows');"
if require_line not in app_text:
    # Put the require alongside other top-level requires.
    first_non_require = re.search(r"\n(?!const .*require\(|let .*require\(|var .*require\()", app_text)
    if first_non_require:
        pos = first_non_require.start() + 1
        app_text = app_text[:pos] + require_line + "\n" + app_text[pos:]
    else:
        app_text = require_line + "\n" + app_text

mount = "app.use('/api/workflows', elev8Workflows.publicRouter);"
worker = "elev8Workflows.startWorkflowWorker();"

if mount not in app_text:
    # Insert before module.exports where possible, otherwise at end.
    marker = re.search(r"\nmodule\.exports\s*=", app_text)
    insertion = f"\n// ELEV8 Automations\n{mount}\n{worker}\n"
    if marker:
        app_text = app_text[:marker.start()] + insertion + app_text[marker.start():]
    else:
        app_text += insertion

app.write_text(app_text, encoding="utf-8")

# Mount admin routes inside the existing admin router so its authentication/session
# middleware remains the source of truth.
admin_require = "const { adminRouter: elev8WorkflowsAdminRouter } = require('../modules/workflows');"
if admin_require not in admin_text:
    admin_text = admin_require + "\n" + admin_text

admin_mount = "router.use('/workflows', elev8WorkflowsAdminRouter);"
if admin_mount not in admin_text:
    marker = re.search(r"\nmodule\.exports\s*=", admin_text)
    if not marker:
        raise SystemExit("Could not safely find module.exports in src/routes/admin.js. Files were copied, but admin route was not mounted.")
    admin_text = admin_text[:marker.start()] + "\n// ELEV8 Automations\n" + admin_mount + "\n" + admin_text[marker.start():]

admin.write_text(admin_text, encoding="utf-8")

# Add the nav enhancer to the existing ELEV8 admin shell.
if html.exists():
    html_text = html.read_text(encoding="utf-8")
    script = '<script src="/elev8-workflows-nav.js" defer></script>'
    if script not in html_text:
        if "</body>" in html_text:
            html_text = html_text.replace("</body>", f"  {script}\n</body>", 1)
        else:
            html_text += "\n" + script + "\n"
        html.write_text(html_text, encoding="utf-8")

print("Patched:")
print(" - src/app.js")
print(" - src/routes/admin.js")
if html.exists(): print(" - public/admin.html")
PY

# Ensure email action dependency is available.
if ! node -e "require('nodemailer')" >/dev/null 2>&1; then
  echo "nodemailer is not currently installed; adding it for workflow email actions..."
  npm install nodemailer@^7 --save
fi

echo
echo "=== Syntax ==="
for f in \
  src/modules/workflows/workflows.models.js \
  src/modules/workflows/workflows.crypto.js \
  src/modules/workflows/workflows.engine.js \
  src/modules/workflows/workflows.service.js \
  src/modules/workflows/workflows.scheduler.js \
  src/modules/workflows/workflows.routes.js \
  src/modules/workflows/index.js \
  public/modules/workflows/admin.js \
  public/elev8-workflows-nav.js \
  scripts/workflows-smoke-test.js
do
  node --check "$f"
done

echo
echo "=== Smoke test ==="
node scripts/workflows-smoke-test.js

echo
echo "=== Existing ELEV8 preflight ==="
npm run deploy:preflight

echo
echo "Installed successfully."
echo "Backup: $BACKUP"
echo
echo "Required environment variable before storing credentials:"
echo "  ELEV8_WORKFLOWS_SECRET=<long random secret>"
echo
echo "Admin page:"
echo "  /modules/workflows/index.html?shop=<your-store.myshopify.com>"
echo
echo "Next: wire the existing verified Shopify webhook handler to ingestEvent()."
echo "See docs/ELEV8-WORKFLOWS.md"
