/* Nectar Reviews — AI Email Module Builder enhancer
   Adds a safe generative module builder on top of the existing Messaging > Modules UI.
   It does not render AI code. It asks the server for approved module settings, fills the
   existing module form, and lets the current module renderer save/insert the result.
*/
(function () {
  const DEFAULT_API = `${window.location.origin}/api`;
  let latestVariants = [];

  function el(id) { return document.getElementById(id); }
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>'"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[c]));
  }
  function showToast(message) {
    if (typeof window.showToast === 'function') return window.showToast(message);
    if (window.shopify && window.shopify.toast) return window.shopify.toast.show(message);
    alert(message);
  }
  function getShopDomain() {
    const params = new URLSearchParams(window.location.search);
    return (window.SHOP_DOMAIN || params.get('shop') || params.get('shopDomain') || 'your-dev-store.myshopify.com').toLowerCase();
  }
  function apiPath(path) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}shopDomain=${encodeURIComponent(getShopDomain())}`;
  }
  async function securedFetch(path, options = {}) {
    if (typeof window.adminFetch === 'function') return window.adminFetch(path, options);
    const secret = sessionStorage.getItem('nectar_admin_secret') || '';
    const signedToken = sessionStorage.getItem('nectar_admin_token') || '';
    const headers = {
      'Content-Type': 'application/json',
      'X-Shop-Domain': getShopDomain(),
      ...(options.headers || {}),
    };
    if (signedToken) headers['X-Nectar-Admin-Token'] = signedToken;
    if (secret) headers['X-Nectar-Admin-Secret'] = secret;
    const res = await fetch(`${DEFAULT_API}${apiPath(path)}`, { ...options, headers });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const json = await res.json();
        message = json.error || json.detail || message;
      } catch (_) {}
      throw new Error(message);
    }
    return res.json();
  }

  function injectStyles() {
    if (el('nr-ai-module-builder-styles')) return;
    const style = document.createElement('style');
    style.id = 'nr-ai-module-builder-styles';
    style.textContent = `
      .msg-ai-builder-card{position:relative;overflow:hidden;border:1px solid #dbeafe!important;background:linear-gradient(135deg,#eff6ff 0%,#ffffff 48%,#f8fafc 100%)!important;}
      .msg-ai-builder-card:before{content:'AI';position:absolute;right:18px;top:18px;border:1px solid #bfdbfe;background:#fff;color:#1d4ed8;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:950;letter-spacing:.08em;}
      .msg-ai-prompt-row{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:10px;align-items:end;}
      .msg-ai-builder-card textarea{min-height:116px;}
      .msg-ai-examples{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
      .msg-ai-chip{border:1px solid #bfdbfe;background:#fff;color:#1e3a8a;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;cursor:pointer;}
      .msg-ai-result-list{display:grid;gap:10px;margin-top:14px;}
      .msg-ai-variant-card{border:1px solid var(--border,#e5e7eb);border-radius:14px;background:#fff;padding:14px;display:grid;gap:10px;}
      .msg-ai-variant-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;}
      .msg-ai-variant-head strong{display:block;font-size:15px;}
      .msg-ai-pill{display:inline-flex;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:950;padding:4px 8px;white-space:nowrap;}
      .msg-ai-preview{border-style:solid;border-radius:14px;padding:14px;background:#fff;}
      .msg-ai-preview h4{margin:0 0 6px;font-size:16px;}
      .msg-ai-preview p{margin:0;color:#475467;line-height:1.45;}
      .msg-ai-preview .msg-ai-preview-button{display:inline-flex;margin-top:10px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;padding:9px 12px;font-size:12px;font-weight:950;}
      .msg-ai-actions{display:flex;gap:8px;flex-wrap:wrap;}
      .msg-ai-small{color:#667085;font-size:12px;line-height:1.45;margin:0;}
      .msg-ai-warning{border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:800;}
      @media(max-width:720px){.msg-ai-prompt-row{grid-template-columns:1fr}.msg-ai-actions .msg-btn{width:100%;}}
    `;
    document.head.appendChild(style);
  }

  function cardHtml() {
    return `
      <div id="msg-ai-builder" class="msg-card msg-ai-builder-card">
        <h3>AI module builder ✨</h3>
        <p>Describe the block you want. Nectar will generate approved module settings, not raw code, so the result still uses the existing email renderer.</p>
        <label for="msg-ai-module-prompt">What should this module say or do?</label>
        <div class="msg-ai-prompt-row">
          <textarea id="msg-ai-module-prompt" placeholder="Example: Create a premium review request module with the title ‘How did we do?’, a short description, gold border, rounded corners and a black review button."></textarea>
          <label>Variants
            <select id="msg-ai-module-variants">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
        </div>
        <div class="msg-ai-examples" aria-label="Example prompts">
          <button type="button" class="msg-ai-chip" data-ai-example="Create a premium review request module with a soft cream background, gold border, rounded corners, a short review prompt and a black Leave a review button.">Premium review CTA</button>
          <button type="button" class="msg-ai-chip" data-ai-example="Create a friendly support-first module that asks customers to contact us before leaving a negative review. Include a support button.">Support-first module</button>
          <button type="button" class="msg-ai-chip" data-ai-example="Create three A/B variants for a loyalty points reminder module. It should explain that verified reviews may earn points after approval.">A/B loyalty variants</button>
        </div>
        <div class="msg-actions">
          <button id="msg-ai-generate-module" type="button" class="msg-btn">Generate module</button>
          <button id="msg-ai-save-all" type="button" class="msg-btn secondary" disabled>Save all variants</button>
        </div>
        <p class="msg-ai-small">Good for quick changes, campaign variants and A/B testing foundations. Saved variants appear in the normal Module library.</p>
        <div id="msg-ai-module-results" class="msg-ai-result-list"></div>
      </div>
    `;
  }

  function findModuleFormCard() {
    const formInput = el('msg-module-name');
    if (formInput) return formInput.closest('.msg-card') || formInput.parentElement;
    const library = el('msg-module-library');
    if (library) return library.closest('.msg-card') || library.parentElement;
    return null;
  }

  function injectBuilder() {
    if (el('msg-ai-builder')) return true;
    const formCard = findModuleFormCard();
    const mount = el('nr-messaging-campaigns-mount');
    if (!formCard && !mount) return false;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = cardHtml().trim();
    const card = wrapper.firstElementChild;
    if (formCard && formCard.parentNode) formCard.parentNode.insertBefore(card, formCard);
    else mount.appendChild(card);
    bindAiBuilder();
    return true;
  }

  function setValue(id, value) {
    const node = el(id);
    if (!node) return;
    const safe = value == null ? '' : String(value);
    node.value = safe === 'none' && node.type === 'color' ? '#ffffff' : safe;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillModuleForm(module, suffix = '') {
    const labelSuffix = suffix ? ` ${suffix}` : '';
    setValue('msg-module-name', `${module.name || module.title || 'AI module'}${labelSuffix}`.trim());
    setValue('msg-module-title', module.title || module.name || 'AI module');
    setValue('msg-module-text', module.text || '');
    setValue('msg-module-position', module.position || 'before');
    setValue('msg-module-bg', module.bgColor || 'none');
    setValue('msg-module-border', module.borderColor || '#e5e7eb');
    setValue('msg-module-border-width', Number(module.borderWidth ?? 1));
    setValue('msg-module-radius', Number(module.radius ?? 14));
    setValue('msg-module-padding', Number(module.padding ?? 16));
    setValue('msg-module-button-text', module.buttonText || '');
    setValue('msg-module-button-url', module.buttonUrl || '');
    setValue('msg-module-link-type', module.linkType || 'external');
  }

  function clickSaveModule() {
    const btn = el('msg-save-module');
    if (!btn) throw new Error('Could not find the existing Save Module button.');
    btn.click();
  }

  function saveModule(module, suffix = '') {
    fillModuleForm(module, suffix);
    clickSaveModule();
  }

  function saveAndInsert(module) {
    saveModule(module);
    setTimeout(() => {
      const cards = Array.from(document.querySelectorAll('.msg-module-card'));
      const matchingCard = cards.find((card) => {
        const text = card.textContent || '';
        return text.includes(module.title || '') || text.includes(module.name || '');
      });
      const insertBtn = matchingCard?.querySelector('[data-insert-module]')
        || Array.from(document.querySelectorAll('[data-insert-module]')).find((btn) => String(btn.dataset.insertModule || '').startsWith('custom:'));
      if (insertBtn) insertBtn.click();
      else showToast('Module saved. Use Add to email from the Module library to insert it.');
    }, 250);
  }

  function brandPayload() {
    return {
      accentColor: el('msg-color')?.value || '#111827',
      bgColor: el('msg-bg-color')?.value || '#f3f4f6',
      cardColor: el('msg-card-color')?.value || '#ffffff',
      buttonRadius: el('msg-button-radius')?.value || '8',
      heading: el('msg-heading')?.value || '',
      mainButtonText: el('msg-main-button-text')?.value || '',
    };
  }

  function previewButton(module) {
    if (!module.buttonText) return '';
    return `<span class="msg-ai-preview-button">${escapeHtml(module.buttonText)}</span>`;
  }

  function modulePreviewStyle(module) {
    const bg = module.bgColor && module.bgColor !== 'none' ? module.bgColor : '#ffffff';
    const border = module.borderColor && module.borderColor !== 'none' ? module.borderColor : 'transparent';
    const borderWidth = border === 'transparent' ? 0 : Number(module.borderWidth ?? 1);
    return [
      `background:${bg}`,
      `border-color:${border}`,
      `border-width:${borderWidth}px`,
      `border-radius:${Number(module.radius ?? 14)}px`,
      `padding:${Number(module.padding ?? 16)}px`,
    ].join(';');
  }

  function renderResults(data) {
    const box = el('msg-ai-module-results');
    if (!box) return;
    latestVariants = Array.isArray(data.variants) ? data.variants : (data.module ? [data.module] : []);
    const warning = data.warning ? `<div class="msg-ai-warning">${escapeHtml(data.warning)}</div>` : '';
    const providerNote = data.provider === 'fallback'
      ? '<p class="msg-ai-small">Generated with the local safe fallback. Add OPENAI_API_KEY in Render to enable full AI generation.</p>'
      : '<p class="msg-ai-small">Generated with OpenAI and then normalised against Nectar module allowances.</p>';
    box.innerHTML = warning + providerNote + latestVariants.map((module, index) => `
      <div class="msg-ai-variant-card" data-ai-variant-card="${index}">
        <div class="msg-ai-variant-head">
          <div>
            <strong>${escapeHtml(module.name || module.title || 'Generated module')}</strong>
            <p class="msg-ai-small">${escapeHtml(module.rationale || 'Generated from your prompt.')}</p>
          </div>
          <span class="msg-ai-pill">Variant ${escapeHtml(module.variantLabel || String.fromCharCode(65 + index))}</span>
        </div>
        <div class="msg-ai-preview" style="${modulePreviewStyle(module)}">
          <h4>${escapeHtml(module.title || '')}</h4>
          <p>${escapeHtml(module.text || '')}</p>
          ${previewButton(module)}
        </div>
        <div class="msg-ai-actions">
          <button type="button" class="msg-btn secondary" data-ai-use="${index}">Use in form</button>
          <button type="button" class="msg-btn secondary" data-ai-save="${index}">Save module</button>
          <button type="button" class="msg-btn" data-ai-insert="${index}">Save & add to email</button>
        </div>
      </div>
    `).join('');
    el('msg-ai-save-all')?.toggleAttribute('disabled', latestVariants.length < 1);
    box.querySelectorAll('[data-ai-use]').forEach((btn) => btn.addEventListener('click', () => {
      fillModuleForm(latestVariants[Number(btn.dataset.aiUse)] || {});
      showToast('Module settings filled into the form');
    }));
    box.querySelectorAll('[data-ai-save]').forEach((btn) => btn.addEventListener('click', () => {
      saveModule(latestVariants[Number(btn.dataset.aiSave)] || {});
    }));
    box.querySelectorAll('[data-ai-insert]').forEach((btn) => btn.addEventListener('click', () => {
      saveAndInsert(latestVariants[Number(btn.dataset.aiInsert)] || {});
    }));
  }

  async function generateModule() {
    const prompt = (el('msg-ai-module-prompt')?.value || '').trim();
    if (!prompt) return showToast('Describe the module you want first.');
    const button = el('msg-ai-generate-module');
    const resultBox = el('msg-ai-module-results');
    if (button) button.disabled = true;
    if (resultBox) resultBox.innerHTML = '<div class="msg-ai-variant-card"><strong>Generating…</strong><p class="msg-ai-small">Turning your prompt into approved module settings.</p></div>';
    try {
      const data = await securedFetch('/admin/ai/email-module', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          variants: Number(el('msg-ai-module-variants')?.value || 1),
          brand: brandPayload(),
        }),
      });
      renderResults(data);
    } catch (error) {
      if (resultBox) resultBox.innerHTML = `<div class="msg-ai-warning">${escapeHtml(error.message || 'Could not generate module.')}</div>`;
    } finally {
      if (button) button.disabled = false;
    }
  }

  function saveAllVariants() {
    if (!latestVariants.length) return;
    latestVariants.forEach((module, index) => {
      const suffix = latestVariants.length > 1 ? `Variant ${module.variantLabel || String.fromCharCode(65 + index)}` : '';
      saveModule(module, suffix);
    });
    showToast(`${latestVariants.length} module variant${latestVariants.length === 1 ? '' : 's'} saved`);
  }

  function bindAiBuilder() {
    el('msg-ai-generate-module')?.addEventListener('click', () => generateModule());
    el('msg-ai-save-all')?.addEventListener('click', saveAllVariants);
    document.querySelectorAll('[data-ai-example]').forEach((btn) => btn.addEventListener('click', () => {
      setValue('msg-ai-module-prompt', btn.dataset.aiExample || '');
      if ((btn.dataset.aiExample || '').toLowerCase().includes('a/b')) setValue('msg-ai-module-variants', '3');
    }));
  }

  function start() {
    injectStyles();
    if (injectBuilder()) return;
    const observer = new MutationObserver(() => {
      if (injectBuilder()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
