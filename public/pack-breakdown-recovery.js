(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = x => String(x || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function restore() {
    const box = $('elev8-pack-recovery');
    const draft = window.ELEV8VariationImportState?.();
    const parentProductId = $('elev8-pack-parent-id')?.value.trim();
    const result = $('elev8-pack-recovery-result');
    const button = $('elev8-pack-recovery-submit');
    if (!draft?.variants?.length) { result.textContent='Scan the supplier product first, then tick Pack Breakdown on the flavours to repair.'; return; }
    if(!/^(?:gid:\/\/shopify\/Product\/)?\d+$/.test(parentProductId||'')){result.textContent='Enter the exact existing Shopify product ID.';return;}
    const enabled=draft.variants.filter(v=>v.included!==false && v.packBreakdown?.enabled);
    if(!enabled.length){result.textContent='Tick Sell individually / shared stock and enter units-per-box plus single-unit prices for the selected flavours.';return;}
    if (!confirm(`Repair existing Shopify draft ${parentProductId} for ${enabled.length} enabled box flavours? This may create an UNPUBLISHED individual-stick product and link component inventory. No stock quantities will be changed.`)) return;
    button.disabled=true;result.textContent='Checking existing products, creating/reusing individual units and verifying links…';
    try {
      const response=window.adminFetch ? await window.adminFetch('/admin/product-creation-import/variations/recover-pack',{method:'POST',body:JSON.stringify({parentProductId,draft})})
        : await fetch('/api/admin/product-creation-import/variations/recover-pack',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({parentProductId,draft})});
      const data=typeof response.json==='function' ? await response.json():response;
      if(response.ok===false||data?.error) throw new Error(data?.error||data?.message||`HTTP ${response.status}`);
      result.innerHTML=`<strong>Verified ${Number(data.verified?.length||0)} bundle relationships.</strong><p>Box product: <code>${esc(data.parentProductId)}</code></p><p>Individual-stock product: <code>${esc(data.componentProductId)}</code></p><p>Inventory quantities were not changed. Enter stock on the individual-stick variants in Shopify, not the boxes.</p>`;
    }catch(e){result.textContent=`Recovery stopped: ${e.message}. Check Shopify for an individual-unit draft before retrying. The recovery route is designed to reuse existing draft products.`;}
    finally{button.disabled=false;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const params=new URLSearchParams(location.search);
    if(params.has('recoveryProductId')) $('elev8-pack-parent-id').value=params.get('recoveryProductId');
    $('elev8-pack-recovery-submit')?.addEventListener('click',restore);
  });
})();
