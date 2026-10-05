#!/usr/bin/env bash
set -euo pipefail

REQ=(
  "src/modules/product-creation-import/services/productImportBatch.service.js"
  "public/supplier-sites-admin.js"
  "public/supplier-sites-admin.css"
  "public/admin.html"
  "src/app.js"
)
for f in "${REQ[@]}"; do
  [ -f "$f" ] || { echo "ERROR: Missing $f. Run from repo root."; exit 1; }
done

python3 - <<'PY'
from pathlib import Path
import re

p=Path("src/modules/product-creation-import/services/productImportBatch.service.js")
s=p.read_text()

old = """  const queries=[barcode,sku,title,handle].filter(Boolean);
  const byKey=new Map();

  for(const q of queries.slice(0,4)){"""
new = """  let sourceHandle='';
  try{
    sourceHandle=new URL(draft.sourceUrl||'').pathname.split('/products/')[1]?.split('/')[0]||'';
  }catch(_){}

  const simplerTitle=cleanText(title
    .replace(/\\b2\\.0\\b/ig,' ')
    .replace(/\\b(new|improved|energy|formula|powder|tub|drink|40 servings?)\\b/ig,' ')
    .replace(/\\s+/g,' '),180);

  const queries=Array.from(new Set([
    barcode,sku,handle,sourceHandle,title,simplerTitle
  ].filter(Boolean)));
  const byKey=new Map();

  for(const q of queries.slice(0,6)){"""
if old in s:
    s=s.replace(old,new)

s=s.replace(
"""  if (existingProduct) { item.approvalStatus = 'rejected'; item.error = 'Skipped: an exact Shopify product already exists.'; }""",
"""  if (existingProduct) {
    item.approvalStatus = 'rejected';
    item.error = '';
    item.suggestions = { ...(item.suggestions || {}), existingProduct };
  }"""
)

# Ensure the importer supplies a title without needing a merchant to type it.
title_anchor = """  draft = applySupplierProfile(draft);"""
title_replacement = """  // A product title should come from the supplier/source before a human has to
  // type anything. Prefer extracted Shopify/JSON-LD/page titles, then the URL slug.
  if (!cleanText(draft.title || '', 220) || /^imported product$/i.test(cleanText(draft.title || '', 220))) {
    const raw = item.extractedData || {};
    let sourceTitle = cleanText(
      raw.rawSupplierProduct?.title ||
      raw.productTitle ||
      raw.pageTitle ||
      raw.title ||
      '',
      220
    );
    if (!sourceTitle && item.sourceUrl) {
      try {
        const slug = new URL(item.sourceUrl).pathname.split('/').filter(Boolean).pop() || '';
        sourceTitle = cleanText(
          decodeURIComponent(slug)
            .replace(/[-_]+/g, ' ')
            .replace(/\\b\\w/g, (char) => char.toUpperCase()),
          220
        );
      } catch (_) {}
    }
    if (sourceTitle) draft.title = sourceTitle;
  }

  draft = applySupplierProfile(draft);"""
if title_anchor in s and "A product title should come from the supplier/source" not in s:
    s=s.replace(title_anchor,title_replacement)

anchor = """  item.completeness = completeness({ draft: item.draft || {}, item, metadata });
  item.validation = validateDraft(item.draft || {}, item);
  if (!item.completeness.ready) { item.validation.status = 'blocked'; item.validation.blockers = item.completeness.blockers; item.validation.issues = Array.from(new Set([...(item.validation.issues || []), ...item.completeness.blockers])); }
  item.updatedAt = new Date();"""
replacement = """  item.completeness = completeness({ draft: item.draft || {}, item, metadata });
  item.validation = validateDraft(item.draft || {}, item);
  if (!item.completeness.ready) { item.validation.status = 'blocked'; item.validation.blockers = item.completeness.blockers; item.validation.issues = Array.from(new Set([...(item.validation.issues || []), ...item.completeness.blockers])); }

  if (patch.draft && item.status !== 'created') {
    const existingProduct = await detectExistingProduct({ shopDomain, draft: item.draft || {} }).catch(() => null);
    if (existingProduct) {
      item.suggestions = { ...(item.suggestions || {}), existingProduct };
      item.status = 'skipped';
      item.approvalStatus = 'rejected';
      item.error = '';
    } else {
      if (item.suggestions?.existingProduct) {
        const nextSuggestions = { ...(item.suggestions || {}) };
        delete nextSuggestions.existingProduct;
        item.suggestions = nextSuggestions;
      }
      if (item.status === 'skipped') item.status = 'needs_review';
      if (item.approvalStatus === 'rejected') item.approvalStatus = 'pending';
    }
  }

  item.updatedAt = new Date();"""
if anchor in s:
    s=s.replace(anchor,replacement)

old = """      if (existing) {
        item.status = 'skipped';
        item.approvalStatus = 'rejected';
        item.error = `Skipped duplicate: ${existing.title || item.draft?.title || 'product'} already exists in Shopify.`;
        results.push({ itemId: item.itemId, status: 'skipped', existingProduct: existing });
        continue;
      }"""
new = """      if (existing) {
        item.status = 'skipped';
        item.approvalStatus = 'rejected';
        item.error = '';
        item.suggestions = { ...(item.suggestions || {}), existingProduct: existing };
        results.push({
          itemId: item.itemId,
          status: 'skipped',
          created: false,
          existingProduct: existing,
          message: `${existing.title || item.draft?.title || 'Product'} already exists in Shopify. No new draft was created.`
        });
        continue;
      }"""
if old in s:
    s=s.replace(old,new)

old = """      item.shopifyProduct = product;
      item.status = 'created';
      item.createdAt = new Date();
      item.error = '';
      results.push({ itemId: item.itemId, status: 'created', product });"""
new = """      if (!product?.id && !product?.legacyResourceId) {
        throw new Error('Shopify returned no product ID, so draft creation could not be verified.');
      }
      item.shopifyProduct = product;
      item.status = 'created';
      item.createdAt = new Date();
      item.error = '';
      item.suggestions = { ...(item.suggestions || {}) };
      if (item.suggestions.existingProduct) delete item.suggestions.existingProduct;
      results.push({ itemId: item.itemId, status: 'created', created: true, product });"""
if old in s:
    s=s.replace(old,new)

p.write_text(s)

p=Path("public/supplier-sites-admin.js")
s=p.read_text()
s=s.replace('>↗</button>', '>Map</button>')

old = """      const failed=(data.results||[]).find(x=>x.itemId===id&&x.status==='failed');
      if(failed) throw new Error(failed.error||'Shopify draft creation failed.');
      state.activeBatch=data.batch;
      renderProducts();
      modalStatus('Shopify draft product created successfully.','ok');
      $('spm-validation').textContent='Status: created';"""
new = """      const result=(data.results||[]).find(x=>x.itemId===id);
      if(!result) throw new Error('Shopify returned no result for this product.');
      if(result.status==='failed') throw new Error(result.error||'Shopify draft creation failed.');

      state.activeBatch=data.batch;
      renderProducts();
      openItemModal(id);

      if(result.status==='skipped'){
        const existing=result.existingProduct;
        modalStatus(
          existing
            ? `No draft created — this matches existing Shopify product "${existing.title}" (${Math.round(Number(existing.confidence||0)*100)}% match).`
            : 'No draft created — Shopify duplicate protection skipped this product.',
          'warn'
        );
        $('spm-validation').textContent='Status: exists in Shopify · No duplicate draft created';
        return;
      }

      if(result.status!=='created' || (!result.product?.id && !result.product?.legacyResourceId)){
        throw new Error('Shopify draft creation could not be verified. No success state has been saved.');
      }

      modalStatus(`Shopify draft created successfully: ${result.product.title||$('spm-title').value}.`,'ok');
      $('spm-validation').textContent='Status: created in Shopify';"""
if old in s:
    s=s.replace(old,new)

old = """    if(existing) return { cls:'exists', label:'Exists in Shopify' };"""
new = """    if(existing) {
      const match=item?.suggestions?.existingProduct||item?.draft?.suggestions?.existingProduct;
      return { cls:'exists', label:match?.title ? `Exists in Shopify: ${match.title}` : 'Exists in Shopify' };
    }"""
if old in s:
    s=s.replace(old,new)

p.write_text(s)

p=Path("public/supplier-sites-admin.css")
s=p.read_text()
if "Mapping controls: intentionally visible" not in s:
    s += """
/* Mapping controls: intentionally visible rather than icon-only */
.supplier-field-map-row{grid-template-columns:minmax(0,1fr) 52px !important}
.supplier-map-btn{width:52px !important;min-width:52px;font-size:11px !important;letter-spacing:.02em;text-transform:uppercase;font-weight:800 !important}
"""
p.write_text(s)

p=Path("public/admin.html")
s=p.read_text()
s=re.sub(r'/supplier-sites-admin\\.js\\?v=[^"\\\']+', '/supplier-sites-admin.js?v=supplier-sites-7', s)
s=re.sub(r'/supplier-sites-admin\\.css\\?v=[^"\\\']+', '/supplier-sites-admin.css?v=supplier-sites-7', s)
p.write_text(s)

p=Path("src/app.js")
s=p.read_text()
anchor="app.use(express.static(publicDir, { etag: true, maxAge: env.nodeEnv === 'production' ? '5m' : 0, index: false }));"
if "Supplier Sites admin assets are intentionally no-store" not in s:
    replacement="""// Supplier Sites admin assets are intentionally no-store.
app.get(['/supplier-sites-admin.js', '/supplier-sites-admin.css'], (req, res) => {
  const asset = path.basename(req.path);
  const filePath = path.join(publicDir, asset);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.sendFile(filePath);
});

app.use(express.static(publicDir, { etag: true, maxAge: env.nodeEnv === 'production' ? '5m' : 0, index: false }));"""
    s=s.replace(anchor,replacement)
p.write_text(s)

print("Applied Supplier Sites repair")
PY

node --check src/modules/product-creation-import/services/productImportBatch.service.js
node --check public/supplier-sites-admin.js
node --check src/app.js
npm run deploy:preflight

echo
echo "Repair passed."
echo "git add src/modules/product-creation-import/services/productImportBatch.service.js public/supplier-sites-admin.js public/supplier-sites-admin.css public/admin.html src/app.js"
echo 'git commit -m "Fix Supplier Sites creation status matching and stale assets"'
echo "git push origin clean-main"
