(() => {
  const params = new URLSearchParams(location.search);
  const shop = params.get('shop') || params.get('shopDomain') || '';
  const q = shop ? `?shop=${encodeURIComponent(shop)}` : '';
  const api = '/api/admin/product-creation-import/x-zero';

  const $ = (id) => document.getElementById(id);
  $('backToAdmin').href = `/admin${q}`;
  $('openImporter').href = `/admin${q}#product-creation-import`;

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || json.message || `Request failed (${response.status})`);
    return json;
  }

  function renderBatch(batch) {
    const items = batch?.items || [];
    $('dbCount').textContent = String(items.length || 0);
    $('approvedCount').textContent = String(items.filter((item) => item.approvalStatus === 'approved').length);
    $('createdCount').textContent = String(items.filter((item) => item.status === 'created').length);
    $('productList').innerHTML = items.slice(0, 24).map((item) => {
      const img = item.selectedImages?.[0]?.src || item.draft?.images?.[0]?.src || '';
      const price = item.draft?.price ? `£${item.draft.price}` : 'Price to check';
      const state = item.status === 'created' ? 'Draft created' : item.approvalStatus === 'approved' ? 'Approved' : 'Review';
      return `<article class="xz-product">
        <div class="xz-image">${img ? `<img src="${img.replace(/"/g, '&quot;')}" alt="">` : '<span>No image</span>'}</div>
        <div class="xz-product-copy"><strong>${String(item.draft?.title || item.title || '').replace(/</g, '&lt;')}</strong><span>${price}</span><small>${state}</small></div>
      </article>`;
    }).join('') || '<p class="xz-empty">Sync the catalogue to create the review queue.</p>';
  }

  async function load() {
    try {
      const preview = await jsonFetch(`${api}/preview?maxProducts=500`);
      $('sourceCount').textContent = String(preview.count || 0);
      $('statusText').textContent = `${preview.count || 0} products currently available from the X-Zero catalogue feed.`;
    } catch (error) {
      $('statusText').textContent = `Could not preview X-Zero: ${error.message}`;
    }
    if (!shop) {
      $('statusText').textContent += ' Open this page with ?shop=your-store.myshopify.com so the MongoDB batch is tied to the correct Shopify shop.';
      return;
    }
    try {
      const result = await jsonFetch(`${api}/batch?shopDomain=${encodeURIComponent(shop)}`);
      renderBatch(result.batch);
    } catch (error) {
      $('statusText').textContent = `Catalogue preview loaded, but the saved batch could not be read: ${error.message}`;
    }
  }

  $('syncButton').addEventListener('click', async () => {
    if (!shop) {
      $('statusText').textContent = 'Missing shop. Open this page from /x-zero-import.html?shop=YOUR-STORE.myshopify.com';
      return;
    }
    const button = $('syncButton');
    button.disabled = true;
    button.textContent = 'Syncing…';
    $('statusText').textContent = 'Pulling the X-Zero Shopify catalogue into MongoDB…';
    try {
      const result = await jsonFetch(`${api}/sync`, {
        method: 'POST',
        body: JSON.stringify({ shopDomain: shop, maxProducts: 500 }),
      });
      renderBatch(result.batch);
      const s = result.sync || {};
      $('sourceCount').textContent = String(s.fetched || 0);
      $('statusText').textContent = `Synced ${s.fetched || 0}: ${s.added || 0} new, ${s.changed || 0} changed, ${s.unchanged || 0} unchanged, ${s.removed || 0} no longer present.`;
    } catch (error) {
      $('statusText').textContent = `Sync failed: ${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = 'Sync X-Zero to MongoDB';
    }
  });

  load();
})();
