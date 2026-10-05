#!/usr/bin/env bash
set -euo pipefail

REQ=(
  "src/modules/product-creation-import/services/productImportBatch.service.js"
  "src/modules/product-creation-import/productCreationImport.routes.js"
  "public/supplier-sites-admin.js"
  "public/supplier-sites-admin.css"
  "public/admin.html"
)
for f in "${REQ[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

python3 - <<'PY'
from pathlib import Path
import re

p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()

s=s.replace(
"async function createShopifyDraftsForBatch({ shopDomain, batchId, itemIds = [], approvedOnly = true }) {",
"async function createShopifyDraftsForBatch({ shopDomain, batchId, itemIds = [], approvedOnly = true, forceCreate = false }) {"
)

old = """      const existing = await detectExistingProduct({ shopDomain, draft: item.draft });
      if (existing) {"""
new = """      const existing = forceCreate ? null : await detectExistingProduct({ shopDomain, draft: item.draft });
      if (existing) {"""
if old in s:
    s=s.replace(old,new)
elif "forceCreate ? null : await detectExistingProduct" not in s:
    raise SystemExit("Could not patch duplicate bypass")

old = """      item.shopifyProduct = product;
      item.status = 'created';"""
new = """      item.shopifyProduct = product;
      item.status = 'created';
      if (forceCreate) {
        item.duplicateOverride = {
          used: true,
          usedAt: new Date(),
          reason: 'merchant-confirmed-different-product'
        };
      }"""
if old in s:
    s=s.replace(old,new)

p.write_text(s)

p=Path("src/modules/product-creation-import/productCreationImport.routes.js")
s=p.read_text()
old = """    itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
    approvedOnly: body.approvedOnly !== false,
  });"""
new = """    itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
    approvedOnly: body.approvedOnly !== false,
    forceCreate: body.forceCreate === true,
  });"""
if old in s:
    s=s.replace(old,new)
elif "forceCreate: body.forceCreate === true" not in s:
    raise SystemExit("Could not patch create-shopify-drafts route")
p.write_text(s)

p=Path("public/supplier-sites-admin.js")
s=p.read_text()

old = """            <button id="spm-enrich" type="button" class="secondary-btn">Enrich this product</button>
            <button id="spm-save" type="button" class="secondary-btn">Save MongoDB draft</button>
            <button id="spm-create" type="button" class="primary-btn">Create Shopify Draft</button>"""
new = """            <button id="spm-enrich" type="button" class="secondary-btn">Enrich this product</button>
            <button id="spm-save" type="button" class="secondary-btn">Save MongoDB draft</button>
            <button id="spm-override-create" type="button" class="supplier-override-btn" hidden>Override match & create draft</button>
            <button id="spm-create" type="button" class="primary-btn">Create Shopify Draft</button>"""
if old in s:
    s=s.replace(old,new)
elif "spm-override-create" not in s:
    raise SystemExit("Could not add override button")

s=s.replace(
"    $('spm-create').addEventListener('click',createItemShopifyDraft);",
"    $('spm-create').addEventListener('click',()=>createItemShopifyDraft(false));\n    $('spm-override-create').addEventListener('click',()=>createItemShopifyDraft(true));"
)

s=s.replace(
"  async function createItemShopifyDraft(){",
"  async function createItemShopifyDraft(forceCreate=false){"
)

s=s.replace(
"        body:JSON.stringify({itemIds:[id],approvedOnly:false})",
"        body:JSON.stringify({itemIds:[id],approvedOnly:false,forceCreate:forceCreate===true})"
)

s=s.replace(
"      modalStatus('Creating an unpublished Shopify draft product…','warn');",
"""      modalStatus(
        forceCreate
          ? 'Override confirmed — creating a NEW unpublished Shopify draft despite the similarity match…'
          : 'Creating an unpublished Shopify draft product…',
        'warn'
      );"""
)

old = """        $('spm-validation').textContent='Status: exists in Shopify · No duplicate draft created';
        return;"""
new = """        $('spm-validation').textContent='Status: possible existing Shopify match · No duplicate draft created';
        const overrideBtn=$('spm-override-create');
        if(overrideBtn) overrideBtn.hidden=false;
        return;"""
if old in s:
    s=s.replace(old,new)

old = """      modalStatus(`Shopify draft created successfully: ${result.product.title||$('spm-title').value}.`,'ok');
      $('spm-validation').textContent='Status: created in Shopify';"""
new = """      modalStatus(
        forceCreate
          ? `New Shopify draft created after duplicate override: ${result.product.title||$('spm-title').value}.`
          : `Shopify draft created successfully: ${result.product.title||$('spm-title').value}.`,
        'ok'
      );
      $('spm-validation').textContent=forceCreate
        ? 'Status: created in Shopify · duplicate match manually overridden'
        : 'Status: created in Shopify';
      const overrideBtn=$('spm-override-create');
      if(overrideBtn) overrideBtn.hidden=true;"""
if old in s:
    s=s.replace(old,new)

anchor = """    $('spm-validation').textContent=`Status: ${item.status||'queued'} · ${(item.validation?.issues||[]).join(' · ')||item.error||'No validation message'}`;
    $('spm-status').hidden=true;"""
replacement = """    $('spm-validation').textContent=`Status: ${item.status||'queued'} · ${(item.validation?.issues||[]).join(' · ')||item.error||'No validation message'}`;
    const existingMatch=item?.suggestions?.existingProduct||item?.draft?.suggestions?.existingProduct;
    const overrideBtn=$('spm-override-create');
    if(overrideBtn) overrideBtn.hidden=!existingMatch || item.status==='created';
    $('spm-status').hidden=true;"""
if anchor in s:
    s=s.replace(anchor,replacement)

p.write_text(s)

p=Path("public/supplier-sites-admin.css")
s=p.read_text()
if ".supplier-override-btn{" not in s:
    s += """
.supplier-override-btn{
  border:1px solid #f59e0b;
  background:#fff7ed;
  color:#9a3412;
  border-radius:10px;
  padding:10px 14px;
  font-weight:800;
  cursor:pointer;
}
.supplier-override-btn:hover{
  background:#ffedd5;
  border-color:#ea580c;
}
"""
p.write_text(s)

p=Path("public/admin.html")
s=p.read_text()
s=re.sub(r'/supplier-sites-admin\.js\?v=[^"\']+', '/supplier-sites-admin.js?v=supplier-sites-8', s)
s=re.sub(r'/supplier-sites-admin\.css\?v=[^"\']+', '/supplier-sites-admin.css?v=supplier-sites-8', s)
p.write_text(s)

print("Added explicit duplicate override/create flow")
PY

node --check src/modules/product-creation-import/services/productImportBatch.service.js
node --check src/modules/product-creation-import/productCreationImport.routes.js
node --check public/supplier-sites-admin.js
npm run deploy:preflight

echo
echo "Duplicate override flow ready."
echo "Commit:"
echo "  git add src/modules/product-creation-import/services/productImportBatch.service.js src/modules/product-creation-import/productCreationImport.routes.js public/supplier-sites-admin.js public/supplier-sites-admin.css public/admin.html"
echo '  git commit -m "Add explicit duplicate override for supplier drafts"'
echo "  git push origin clean-main"
