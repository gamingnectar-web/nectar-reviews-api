#!/usr/bin/env bash
set -euo pipefail

SERVICE="src/modules/product-creation-import/services/productImportBatch.service.js"
ROUTES="src/modules/product-creation-import/productCreationImport.routes.js"
UI="public/supplier-sites-admin.js"
CSS="public/supplier-sites-admin.css"

for f in "$SERVICE" "$ROUTES" "$UI" "$CSS"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

python3 - <<'PY'
from pathlib import Path

# ---------------- Backend: lightweight supplier summaries ----------------
p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()

if "async function listSiteImportBatches(" not in s:
    anchor="""async function listBatches({ shopDomain, limit = 30 }) {
  const batches = await ProductImportBatch.find({ shopDomain }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 30, 100)).lean();
  return { batches };
}
"""
    if anchor not in s:
        raise SystemExit("Could not find listBatches()")

    addition=anchor+"""
async function listSiteImportBatches({ shopDomain, limit = 250 }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 250, 500));
  const batches = await ProductImportBatch.find({
    shopDomain,
    'automation.siteImport': true,
  })
    .select({
      name: 1,
      supplierName: 1,
      supplierUrl: 1,
      status: 1,
      summary: 1,
      automation: 1,
      'defaults.supplierUrl': 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(safeLimit)
    .lean();

  return { batches };
}
"""
    s=s.replace(anchor,addition)

if "  listSiteImportBatches," not in s:
    s=s.replace(
"""  listBatches,
  getBatch,""",
"""  listBatches,
  listSiteImportBatches,
  getBatch,"""
    )

p.write_text(s)

# ---------------- Route ----------------
p=Path("src/modules/product-creation-import/productCreationImport.routes.js")
s=p.read_text()

if "  listSiteImportBatches," not in s:
    s=s.replace(
"""  createSiteImportBatch,
  listBatches,""",
"""  createSiteImportBatch,
  listBatches,
  listSiteImportBatches,"""
    )

if "router.get('/batches/site-imports'" not in s:
    anchor="""router.get('/batches', asyncRoute(async (req, res) => {
  const result = await listBatches({ shopDomain: shopDomainFromReq(req), limit: req.query.limit || 30 });
  res.json(result);
}));
"""
    if anchor not in s:
        raise SystemExit("Could not find /batches route")
    addition=anchor+"""
router.get('/batches/site-imports', asyncRoute(async (req, res) => {
  const result = await listSiteImportBatches({
    shopDomain: shopDomainFromReq(req),
    limit: req.query.limit || 250,
  });
  res.json(result);
}));
"""
    s=s.replace(anchor,addition)

p.write_text(s)

# ---------------- Frontend: fast load + dots + single boot ----------------
p=Path("public/supplier-sites-admin.js")
s=p.read_text()

old="""      const data=await api('/batches?limit=100');
      state.batches=(data.batches||[]).filter(b=>b.automation?.siteImport);
      renderSites();
      if(state.activeBatch?._id) await openBatch(state.activeBatch._id);"""

new="""      const data=await api('/batches/site-imports?limit=250');
      state.batches=data.batches||[];
      renderSites();"""

if old in s:
    s=s.replace(old,new)
elif "/batches/site-imports?limit=250" not in s:
    raise SystemExit("Could not patch loadSites()")

# Add status helper once.
if "function productStatusDot(" not in s:
    marker="  function renderProducts(){"
    helper="""  function productStatusDot(item){
    const existing = Boolean(
      item?.shopifyProduct?.id ||
      item?.status === 'created' ||
      item?.status === 'skipped' ||
      item?.suggestions?.existingProduct?.exact ||
      item?.draft?.suggestions?.existingProduct?.exact
    );
    const hasError = item?.status === 'failed' || Boolean(String(item?.error || '').trim());

    if(hasError) return { cls:'error', label:'Error present' };
    if(existing) return { cls:'exists', label:'Exists in Shopify' };
    return { cls:'review', label:'Review required' };
  }

"""
    if marker not in s:
        raise SystemExit("Could not find renderProducts()")
    s=s.replace(marker,helper+marker)

# Replace product head status pill with top-right dot.
old_head="""            <div class="supplier-product-head">
              <strong>${esc(d.title||item.title||'Untitled product')}</strong>
              <span class="pci-pill ${item.status==='created'?'ok':item.status==='failed'?'err':ready?'ok':'warn'}">${esc(item.status||'queued')}</span>
            </div>"""

new_head="""            <div class="supplier-product-head">
              <strong>${esc(d.title||item.title||'Untitled product')}</strong>
            </div>"""

if old_head in s:
    s=s.replace(old_head,new_head)

card_old="""      return `
        <button type="button" class="supplier-product-card" data-item-id="${esc(item.itemId)}">
          <div class="supplier-product-image">"""

card_new="""      const statusDot=productStatusDot(item);
      return `
        <button type="button" class="supplier-product-card" data-item-id="${esc(item.itemId)}">
          <span class="supplier-product-status-dot ${statusDot.cls}" title="${esc(statusDot.label)}" aria-label="${esc(statusDot.label)}"></span>
          <div class="supplier-product-image">"""

if card_old in s:
    s=s.replace(card_old,card_new)
elif "supplier-product-status-dot" not in s:
    raise SystemExit("Could not add product status dot")

# Make boot single-shot even though multiple lifecycle hooks remain.
old_boot="""  function boot(){
    if(!ensureUi()) return;
    loadSites();
  }"""

new_boot="""  let booted=false;
  function boot(){
    if(booted) return;
    if(!ensureUi()) return;
    booted=true;
    loadSites();
  }"""

if old_boot in s:
    s=s.replace(old_boot,new_boot)
elif "let booted=false;" not in s:
    raise SystemExit("Could not make boot idempotent")

p.write_text(s)

# ---------------- CSS ----------------
p=Path("public/supplier-sites-admin.css")
s=p.read_text()

css="""

/* Supplier Sites performance/status refinement */
.supplier-product-card{position:relative}
.supplier-product-status-dot{
  position:absolute;
  top:10px;
  right:10px;
  width:10px;
  height:10px;
  border-radius:999px;
  box-shadow:0 0 0 3px #fff,0 1px 5px rgba(15,23,42,.18);
  z-index:2;
}
.supplier-product-status-dot.exists{background:#22c55e}
.supplier-product-status-dot.review{background:#f59e0b}
.supplier-product-status-dot.error{background:#ef4444}
"""
if "Supplier Sites performance/status refinement" not in s:
    s += css
p.write_text(s)

print("Applied fast supplier sidebar + status dots + single boot")
PY

node --check src/modules/product-creation-import/services/productImportBatch.service.js
node --check src/modules/product-creation-import/productCreationImport.routes.js
node --check public/supplier-sites-admin.js

echo
echo "Running full deploy preflight..."
npm run deploy:preflight

echo
echo "============================================================"
echo " Supplier Sites performance patch complete"
echo "============================================================"
echo
echo "Expected behaviour:"
echo "  - Saved supplier list loads lightweight summaries only"
echo "  - Supplier Sites boots once"
echo "  - Full product arrays load only after selecting a catalogue"
echo "  - Green dot = exists in Shopify"
echo "  - Orange dot = review"
echo "  - Red dot = error"
echo
echo "Commit:"
echo "  git add src/modules/product-creation-import/services/productImportBatch.service.js \\"
echo "          src/modules/product-creation-import/productCreationImport.routes.js \\"
echo "          public/supplier-sites-admin.js \\"
echo "          public/supplier-sites-admin.css"
echo '  git commit -m "Speed up Supplier Sites and add product status dots"'
echo "  git push origin clean-main"
