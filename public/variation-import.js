(() => {
  'use strict';
  let draft = null;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const API = '/api/admin/product-creation-import/variations';
  function status(message, kind = '') { const el = $('pci-var-status'); if(el) { el.className = `pci-status ${kind}`; el.textContent = message; } }
  async function request(path, body) {
    const shop = new URLSearchParams(location.search).get('shop') || window.shopDomain || window.SHOP_DOMAIN || '';
    const headers = { 'Content-Type': 'application/json' };
    if (shop) headers['x-shop-domain'] = shop;
    // Reuse host admin authentication and session handling rather than bare unauthenticated requests.
    const response = window.adminFetch ? await window.adminFetch(`/admin/product-creation-import/variations${path}`, { method:'POST', body:JSON.stringify(body) }) : await fetch(API+path, {method:'POST', credentials:'same-origin', headers, body:JSON.stringify(body)});
    const result = typeof response.json === 'function' ? await response.json() : response;
    if ((response.ok === false) || result?.error) throw new Error(result?.error || result?.message || `Request failed (${response.status || 'unknown'})`);
    return result;
  }
  const input = (label, value, key, type='text') => `<label class="pci-var-field"><span>${esc(label)}</span><input class="pci-input" type="${type}" data-product-field="${esc(key)}" value="${esc(value)}"></label>`;
  function variantCell(i, field, value, type='text') { return `<input class="pci-input" type="${type}" data-variant-index="${i}" data-variant-field="${field}" value="${esc(value)}" ${type==='number'?'min="0" step="0.01"':''}>`; }
  function validate() {
    const selected = draft?.variants?.filter(v => v.included) || [];
    const errors = [];
    const combinations = new Set(), skus = new Set(), barcodes = new Set();
    if (!draft?.title?.trim()) errors.push('Product title is required.');
    if (!selected.length) errors.push('Select at least one variant.');
    if (selected.length>2048) errors.push('Shopify allows a maximum of 2048 variants on most stores.');
    for (const [i, v] of selected.entries()) {
      const key = (v.options || []).map(o => o.value?.trim().toLowerCase()).join('|');
      if (!key || v.options?.some(o => !o.value?.trim())) errors.push(`Row ${i+1}: missing option`);
      if (combinations.has(key)) errors.push(`Row ${i+1}: duplicate option combination`); combinations.add(key);
      if (v.sku && skus.has(v.sku.toLowerCase())) errors.push(`Row ${i+1}: duplicate SKU`); if (v.sku) skus.add(v.sku.toLowerCase());
      if (v.barcode && barcodes.has(v.barcode.toLowerCase())) errors.push(`Row ${i+1}: duplicate barcode`); if(v.barcode)barcodes.add(v.barcode.toLowerCase());
      if (!/^\d+(\.\d{1,2})?$/.test(v.price||'')) errors.push(`Row ${i+1}: invalid price`);
      if (v.compareAtPrice && Number(v.compareAtPrice)<=Number(v.price)) errors.push(`Row ${i+1}: compare-at price must be higher`);
    }
    for(const [i,v] of selected.entries()){ if(!v.packBreakdown?.enabled)continue; const n=Number(v.packBreakdown.unitsPerPack); if(!Number.isSafeInteger(n)||n<2||n>1000) errors.push(`Row ${i+1}: units per box must be 2–1000`); if(!/^\d+(?:\.\d{1,2})?$/.test(String(v.packBreakdown.singlePrice||''))) errors.push(`Row ${i+1}: individual unit price is required`); }
    const summary = $('pci-var-validation');
    if (summary) { summary.innerHTML = errors.length ? `<strong>Needs attention</strong><ul>${errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>` : `<strong>Ready for draft</strong><p>${selected.length} variants will be created in one Shopify draft product. No supplier stock levels will be copied.</p>`; summary.className=`pci-status ${errors.length?'warn':'ok'}`; }
    const btn=$('pci-var-create'); if(btn) btn.disabled = errors.length>0;
    return !errors.length;
  }
  function render() {
    if (!draft) return;
    $('pci-var-editor').hidden = false;
    $('pci-var-product').innerHTML = `<div class="pci-editor-card"><h4>Product information</h4><div class="pci-form-grid">${input('Title',draft.title,'title')}${input('Vendor',draft.vendor,'vendor')}${input('Product type',draft.productType,'productType')}${input('Handle',draft.handle,'handle')}</div><label class="pci-var-field"><span>Description (HTML)</span><textarea class="pci-textarea" data-product-field="descriptionHtml">${esc(draft.descriptionHtml)}</textarea></label><p class="pci-muted">Source: ${esc(draft.sourceUrl)}</p></div>`;
    $('pci-var-options').innerHTML = `<div class="pci-editor-card"><h4>Detected options</h4><div class="pci-chip-row">${(draft.options||[]).map(x=>`<span class="pci-pill">${esc(x.name)} · ${x.values.length} values</span>`).join('')}</div><p class="pci-muted">Actual supplier combinations only; the importer never creates a full cross-product of unrelated option values.</p></div>`;
    $('pci-var-media').innerHTML = `<div class="pci-editor-card"><h4>Product image gallery</h4><div class="pci-var-gallery">${(draft.images||[]).map(x=>`<img src="${esc(x.src)}" alt="${esc(x.alt)}" loading="lazy">`).join('')}</div></div>`;
    $('pci-var-rows').innerHTML = draft.variants.map((v,i)=>`<tr class="${v.included?'':'pci-var-excluded'}"><td><input aria-label="Include variant ${i+1}" type="checkbox" data-variant-index="${i}" data-variant-field="included" ${v.included?'checked':''}></td><td><img class="pci-var-thumb" src="${esc(v.imageUrl||draft.images?.[0]?.src||'')}" alt="Variation media"></td><td><strong>${esc(v.options?.map(o=>o.value).join(' / ')||`Variant ${i+1}`)}</strong><small>${esc(v.sourceVariantId)}</small><div class="pci-pack-setup"><label><input type="checkbox" data-pack-index="${i}" data-pack-field="enabled" ${v.packBreakdown?.enabled?'checked':''}> Sell individually / shared stock</label><div class="pci-pack-settings" ${v.packBreakdown?.enabled?'':'hidden'}><label>Units per box <input class="pci-input" type="number" min="2" max="1000" step="1" data-pack-index="${i}" data-pack-field="unitsPerPack" value="${esc(v.packBreakdown?.unitsPerPack||20)}"></label><label>Single-unit price (£) <input class="pci-input" type="number" min="0" step="0.01" data-pack-index="${i}" data-pack-field="singlePrice" value="${esc(v.packBreakdown?.singlePrice||'')}"></label><small>Shopify tracks each loose unit; this box uses the quantity above.</small></div></div></td><td>${variantCell(i,'sku',v.sku)}</td><td>${variantCell(i,'barcode',v.barcode)}</td><td>${variantCell(i,'price',v.price,'number')}</td><td>${variantCell(i,'compareAtPrice',v.compareAtPrice,'number')}</td><td>${variantCell(i,'cost',v.cost,'number')}</td><td>${variantCell(i,'weight',v.weight)}</td><td><select class="pci-input" data-variant-index="${i}" data-variant-field="imageUrl"><option value="">No individual image</option>${(draft.images||[]).map(img=>`<option value="${esc(img.src)}" ${img.src===v.imageUrl?'selected':''}>${esc(img.alt||img.src.split('/').pop())}</option>`).join('')}</select>${v.imageUrl?'<small>Image assigned</small>':'<small class="pci-var-warning">Check image</small>'}</td><td><small>${v.sourceAvailable?'Available at supplier':'Unavailable at supplier'}</small></td></tr>`).join('');
    const count=draft.variants.filter(v=>v.included).length;
    $('pci-var-count').textContent = `${count} selected of ${draft.variants.length} detected`;
    validate();
  }
  function readChange(e) {
    const el=e.target;
    if (el.dataset.packIndex != null && draft) {
      const variant=draft.variants[Number(el.dataset.packIndex)];
      if(variant){
        variant.packBreakdown=variant.packBreakdown||{enabled:false,unitsPerPack:20,singlePrice:''};
        variant.packBreakdown[el.dataset.packField]=el.type==='checkbox'?el.checked:el.value;
        if(el.dataset.packField==='enabled')el.closest('.pci-pack-setup')?.querySelector('.pci-pack-settings')?.toggleAttribute('hidden',!el.checked);
      }
    }
    if (el.dataset.productField && draft) draft[el.dataset.productField]=el.value;
    if (el.dataset.variantIndex != null && draft) {
      const variant = draft.variants[Number(el.dataset.variantIndex)];
      if (variant) variant[el.dataset.variantField] = el.type==='checkbox'?el.checked:el.value;
    }
    if (el.dataset.variantField==='imageUrl') { const row=el.closest('tr'); const img=row?.querySelector('img'); if(img)img.src=el.value||draft.images?.[0]?.src||''; }
    if (el.dataset.variantField==='included') el.closest('tr')?.classList.toggle('pci-var-excluded',!el.checked);
    if (draft) { $('pci-var-count').textContent=`${draft.variants.filter(v=>v.included).length} selected of ${draft.variants.length} detected`; validate(); }
  }
  async function scan() {
    const url=$('pci-var-url')?.value.trim(); if(!url)return status('Paste a supplier product URL.','warn');
    $('pci-var-editor').hidden=true; status('Scanning all supplier variants and images…');
    $('pci-var-scan').disabled=true;
    try { const result=await request('/scan',{url}); draft=result.draft; render(); status(`Found ${result.count} source variants. Review the entire table and image assignments before creating a draft.`,'ok'); }
    catch(e){status(e.message,'err');}
    finally{$('pci-var-scan').disabled=false;}
  }
  async function create() {
    if(!validate())return;
    const packs=draft.variants.filter(v=>v.included && v.packBreakdown?.enabled).length;
    if(!window.confirm(`Create UNPUBLISHED Shopify drafts with ${draft.variants.filter(v=>v.included).length} variants?${packs ? ` Additionally, ${packs} selected packs will be linked to individual-unit variants via Shopify native bundles. No stock will be assigned.` : ''}`))return;
    $('pci-var-create').disabled=true;status('Creating Shopify draft and uploading variants…');
    try {
      const result=await request('/create',{draft});
      const id=String(result.product.id||'').split('/').pop();
      status(`Draft created: ${result.product.title} (${result.product.variantCount} variants).`,'ok');
      const singles=result.packBreakdown?.componentProductId?.split('/').pop();
      const extra=singles ? `<p><strong>Native bundle relationships linked.</strong> Individual-unit draft: <code>${esc(singles)}</code>. Open it in Shopify to set stock quantities and publish when ready.</p>` : '';
      $('pci-var-result').innerHTML=`<a class="primary-btn" style="display:inline-block;text-decoration:none" href="https://admin.shopify.com/store/${esc((new URLSearchParams(location.search).get('shop')||'').replace('.myshopify.com',''))}/products/${encodeURIComponent(id)}" target="_blank" rel="noopener">Open Shopify draft ↗</a><p>${(result.warnings||[]).map(esc).join(' · ')}</p>${extra}`;
    } catch(e) { status(e.message,'err'); if(!/draft .* was created|Individual-unit draft .* was created/i.test(e.message)) $('pci-var-create').disabled=false; }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('pci-var-scan')?.addEventListener('click',scan);
    $('pci-var-create')?.addEventListener('click',create);
    $('pci-var-editor')?.addEventListener('input',readChange);
    $('pci-var-editor')?.addEventListener('change',readChange);
    $('pci-var-select-all')?.addEventListener('click',()=>{if(draft){draft.variants.forEach(v=>v.included=true);render();}});
    $('pci-var-select-none')?.addEventListener('click',()=>{if(draft){draft.variants.forEach(v=>v.included=false);render();}});
    const source=new URLSearchParams(location.search).get('importUrl');if(source&&$('pci-var-url'))$('pci-var-url').value=source;
  });
})();
