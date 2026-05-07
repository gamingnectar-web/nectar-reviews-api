/*
  Nectar Reviews — Messaging & Campaigns
  File: public/admin-messaging-campaigns.js

  Full restored version.

  Includes:
  - MESSAGING - ADMIN
  - MESSAGING TEMPLATE
  - MESSAGING TEST PAGES
  - Merchant email provider settings
  - Gmail / Google Workspace, Outlook, SendGrid, Postmark, Custom SMTP presets
  - Test email sending with timeout/status messages
  - Shopify App Bridge product picker support
  - Product search fallback
  - Manual product fallback
  - Review page preview generator
  - Shopify Flow HTML generator
*/

(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const SHOP_DOMAIN = window.SHOP_DOMAIN || params.get('shop') || 'your-dev-store.myshopify.com';

  let reviewTestProducts = [];
  let currentMsgTab = 'admin';
  let emailSettingsLoaded = false;

  const providerPresets = {
    none: {
      smtpHost: '',
      smtpPort: '',
      secureMode: 'starttls',
      smtpUser: '',
      fromName: '',
      fromEmail: '',
      replyToEmail: ''
    },
    gmail: {
      smtpHost: 'smtp.gmail.com',
      smtpPort: '587',
      secureMode: 'starttls',
      smtpUser: '',
      fromName: '',
      fromEmail: '',
      replyToEmail: ''
    },
    outlook: {
      smtpHost: 'smtp.office365.com',
      smtpPort: '587',
      secureMode: 'starttls',
      smtpUser: '',
      fromName: '',
      fromEmail: '',
      replyToEmail: ''
    },
    sendgrid: {
      smtpHost: 'smtp.sendgrid.net',
      smtpPort: '587',
      secureMode: 'starttls',
      smtpUser: 'apikey',
      fromName: '',
      fromEmail: '',
      replyToEmail: ''
    },
    postmark: {
      smtpHost: 'smtp.postmarkapp.com',
      smtpPort: '587',
      secureMode: 'starttls',
      smtpUser: '',
      fromName: '',
      fromEmail: '',
      replyToEmail: ''
    },
    custom: {
      smtpHost: '',
      smtpPort: '587',
      secureMode: 'starttls',
      smtpUser: '',
      fromName: '',
      fromEmail: '',
      replyToEmail: ''
    }
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function value(id, fallback = '') {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() || fallback : fallback;
  }

  function checked(id) {
    const el = document.getElementById(id);
    return !!(el && el.checked);
  }

  function setValue(id, nextValue) {
    const el = document.getElementById(id);
    if (el) el.value = nextValue || '';
  }

  function setChecked(id, nextValue) {
    const el = document.getElementById(id);
    if (el) el.checked = !!nextValue;
  }

  function cleanHandle(handle) {
    return String(handle || 'leave-review')
      .trim()
      .replace(/^\/pages\//, '')
      .replace(/^\//, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'leave-review';
  }

  function toast(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }

    console.log(message);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  async function getShopifyResourcePickerBridge() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const bridge =
        (typeof globalThis !== 'undefined' && globalThis.shopify) ||
        (typeof window !== 'undefined' && window.shopify) ||
        null;

      if (bridge && typeof bridge.resourcePicker === 'function') {
        return bridge;
      }

      await wait(100);
    }

    return null;
  }

  function normalizeResourcePickerSelection(result) {
    const rawSelection = Array.isArray(result)
      ? result
      : (result && Array.isArray(result.selection))
        ? result.selection
        : (result && Array.isArray(result.selected))
          ? result.selected
          : [];

    return rawSelection.map((product, index) => {
      const firstVariant = product.variants && product.variants[0];
      const firstImage =
        (product.images && product.images[0]) ||
        product.featuredImage ||
        product.image ||
        null;

      return {
        id: String(product.id || product.admin_graphql_api_id || '').split('/').pop() || `selected-product-${index + 1}`,
        variantId: firstVariant ? String(firstVariant.id || '').split('/').pop() : '',
        title: product.title || product.name || `Selected Product ${index + 1}`,
        handle: product.handle || '',
        image: firstImage ? (firstImage.originalSrc || firstImage.url || firstImage.src || '') : '',
        quantity: 1,
        tags: Array.isArray(product.tags)
          ? product.tags
          : typeof product.tags === 'string'
            ? product.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
            : [],
        metafields: {}
      };
    });
  }

  function injectStyles() {
    if (document.getElementById('nr-messaging-tabs-style')) return;

    const style = document.createElement('style');
    style.id = 'nr-messaging-tabs-style';

    style.textContent = `
      .nr-msg-shell { width:100%; box-sizing:border-box; }
      .nr-msg-hero { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:22px; }
      .nr-msg-kicker { margin:0 0 6px; color:var(--blue,#005bd3); font-size:12px; font-weight:850; letter-spacing:.08em; text-transform:uppercase; }
      .nr-msg-hero h1 { margin:0; color:var(--primary,#111827); font-size:clamp(30px,3vw,44px); line-height:1.05; letter-spacing:-.045em; }
      .nr-msg-hero p { margin:10px 0 0; max-width:760px; color:var(--text-light,#6b7280); font-size:15px; line-height:1.6; }
      .nr-msg-chip { min-width:270px; padding:14px 16px; border:1px solid var(--border,#e5e7eb); border-radius:16px; background:#fff; box-shadow:0 1px 3px rgba(17,24,39,.06); }
      .nr-msg-chip span { display:block; margin-bottom:4px; color:var(--text-light,#6b7280); font-size:12px; font-weight:850; text-transform:uppercase; letter-spacing:.04em; }
      .nr-msg-chip strong { display:block; color:var(--primary,#111827); font-size:13px; line-height:1.5; }

      .nr-msg-tabs { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px; border-bottom:1px solid var(--border,#e5e7eb); }
      .nr-msg-tab-btn { border:0; background:transparent; color:var(--text-light,#6b7280); padding:14px 4px 13px; margin-right:22px; border-bottom:3px solid transparent; font-weight:850; cursor:pointer; letter-spacing:-.01em; }
      .nr-msg-tab-btn.active { color:var(--blue,#005bd3); border-bottom-color:var(--blue,#005bd3); }
      .nr-msg-tab-panel { display:none; }
      .nr-msg-tab-panel.active { display:block; }

      .nr-msg-grid { display:grid; grid-template-columns:minmax(320px,430px) minmax(0,1fr); gap:24px; align-items:start; }
      .nr-msg-grid-one { display:grid; gap:18px; }
      .nr-msg-card { background:#fff; border:1px solid var(--border,#e5e7eb); border-radius:18px; box-shadow:0 1px 3px rgba(17,24,39,.06); overflow:hidden; }
      .nr-msg-card-pad { padding:22px; }
      .nr-msg-card-title { display:flex; gap:12px; align-items:flex-start; margin-bottom:18px; }
      .nr-msg-step { width:30px; height:30px; flex:0 0 30px; display:grid; place-items:center; border-radius:999px; background:var(--primary,#111827); color:#fff; font-weight:900; font-size:13px; }
      .nr-msg-card h2, .nr-msg-card h3 { margin:0; color:var(--primary,#111827); font-size:18px; line-height:1.2; letter-spacing:-.025em; }
      .nr-msg-card p { color:var(--text-light,#6b7280); font-size:13px; line-height:1.5; }
      .nr-msg-card-title p { margin:4px 0 0; }

      .nr-msg-card label { display:block; margin:14px 0 6px; color:var(--primary,#111827); font-size:13px; font-weight:850; }
      .nr-msg-card label em { color:var(--text-light,#6b7280); font-style:normal; font-weight:650; }
      .nr-msg-card input, .nr-msg-card select, .nr-msg-card textarea {
        width:100%; box-sizing:border-box; min-height:44px; border:1px solid #d1d5db; border-radius:10px; background:#fff; color:var(--primary,#111827);
        padding:11px 12px; font-size:14px; outline:none;
      }
      .nr-msg-card textarea { min-height:94px; resize:vertical; font-family:inherit; line-height:1.5; }
      .nr-msg-card input[type="color"] { height:44px; padding:4px; cursor:pointer; }
      .nr-msg-card input:focus, .nr-msg-card select:focus, .nr-msg-card textarea:focus, #flow-code-output:focus {
        border-color:var(--blue,#005bd3); box-shadow:0 0 0 3px rgba(0,91,211,.14);
      }

      .nr-msg-two { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .nr-msg-help { margin-top:16px; padding:12px; border:1px solid var(--border,#e5e7eb); border-radius:12px; background:#f9fafb; color:var(--text-light,#6b7280); font-size:13px; line-height:1.5; }
      .nr-msg-help code { color:var(--primary,#111827); font-weight:800; }
      .nr-msg-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
      .nr-msg-btn, .nr-msg-secondary-btn { min-height:44px; border-radius:10px; padding:12px 16px; font-weight:850; cursor:pointer; }
      .nr-msg-btn { border:0; background:var(--primary,#111827); color:#fff; }
      .nr-msg-btn:disabled, .nr-msg-secondary-btn:disabled { opacity:.6; cursor:not-allowed; }
      .nr-msg-secondary-btn { border:1px solid var(--border,#e5e7eb); background:#f3f4f6; color:var(--primary,#111827); }

      .nr-msg-provider-status { display:inline-flex; align-items:center; gap:8px; min-height:30px; padding:6px 10px; border-radius:999px; font-size:12px; font-weight:850; }
      .nr-msg-provider-status.not-configured { background:#f3f4f6; color:#6b7280; }
      .nr-msg-provider-status.connected { background:#dcfce7; color:#047857; }
      .nr-msg-provider-status.failed { background:#fee2e2; color:#b91c1c; }

      .nr-msg-preview-head, .nr-msg-code-head { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px; border-bottom:1px solid var(--border,#e5e7eb); }
      .nr-msg-toggle { display:inline-flex; padding:4px; border:1px solid var(--border,#e5e7eb); border-radius:999px; background:#f9fafb; }
      .nr-msg-toggle button { border:0; border-radius:999px; background:transparent; color:var(--text-light,#6b7280); padding:9px 14px; font-weight:850; cursor:pointer; }
      .nr-msg-toggle button.active { background:var(--primary,#111827); color:#fff; }
      .nr-msg-preview-stage { padding:28px; overflow:auto; background:#f9fafb; border-radius:0 0 18px 18px; }
      .nr-msg-preview-wrap { transition:max-width .25s ease,border .25s ease,border-radius .25s ease; }
      .nr-msg-preview-wrap.mobile { max-width:390px; margin:0 auto; border:12px solid #111827; border-radius:34px; overflow:hidden; background:#fff; }
      #flow-email-preview { min-height:320px; }
      #flow-code-output {
        display:block; width:100%; min-height:430px; box-sizing:border-box; border:0; background:#18181b; color:#fff; padding:18px;
        font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size:12px; line-height:1.55; resize:vertical; outline:none;
      }

      .nr-review-test-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
      .nr-review-test-products { margin-top:14px; display:grid; gap:8px; }
      .nr-review-test-product { display:grid; grid-template-columns:54px 1fr; gap:12px; align-items:center; padding:10px; border:1px solid var(--border,#e5e7eb); border-radius:12px; background:#fff; }
      .nr-review-test-product img, .nr-review-test-placeholder { width:54px; height:54px; object-fit:cover; border-radius:10px; background:#e5e7eb; }
      .nr-review-test-product strong { display:block; color:var(--primary,#111827); font-size:13px; line-height:1.35; }
      .nr-review-test-product span { display:block; color:var(--text-light,#6b7280); font-size:12px; margin-top:2px; }

      .nr-test-email-result { display:none; margin-top:14px; padding:12px; border-radius:12px; font-size:13px; line-height:1.5; }
      .nr-test-email-result.success { display:block; background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; }
      .nr-test-email-result.warn { display:block; background:#fffbeb; color:#92400e; border:1px solid #fde68a; }
      .nr-test-email-result.error { display:block; background:#fff1f2; color:#be123c; border:1px solid #fecdd3; }

      .nr-product-search-results { margin-top:10px; display:grid; gap:8px; }
      .nr-product-search-result {
        display:grid; grid-template-columns:42px 1fr auto; gap:10px; align-items:center; padding:9px;
        border:1px solid var(--border,#e5e7eb); border-radius:10px; background:#fff;
      }
      .nr-product-search-result img { width:42px; height:42px; border-radius:8px; object-fit:cover; background:#e5e7eb; }

      @media (max-width:1100px) {
        .nr-msg-hero, .nr-msg-preview-head, .nr-msg-code-head { flex-direction:column; align-items:stretch; }
        .nr-msg-chip { min-width:0; }
        .nr-msg-grid { grid-template-columns:1fr; }
      }

      @media (max-width:640px) {
        .nr-msg-two, .nr-review-test-actions { grid-template-columns:1fr; }
        .nr-msg-preview-stage { padding:14px; }
        .nr-msg-toggle, .nr-msg-btn, .nr-msg-secondary-btn { width:100%; }
        .nr-msg-toggle button { flex:1; }
      }
    `;

    document.head.appendChild(style);
  }

  function findContainer() {
    const el = document.getElementById('v-msg');
    if (el) return el;

    const legacyOutput = document.getElementById('flow-code-output');
    if (legacyOutput) return legacyOutput.closest('.view') || legacyOutput.closest('section') || legacyOutput.parentElement;

    const headings = Array.from(document.querySelectorAll('h1,h2,h3'));
    const match = headings.find((h) => /messaging|campaign|shopify flow/i.test(h.textContent || ''));
    return match ? (match.closest('.view') || match.closest('section') || match.parentElement) : null;
  }

  function renderShell() {
    return `
      <div class="nr-msg-shell">
        <header class="nr-msg-hero">
          <div>
            <p class="nr-msg-kicker">Messaging & Campaigns</p>
            <h1>Review Request Messaging</h1>
            <p>
              Build your review email, save merchant-owned email credentials, preview the review page, and send a test email before going live.
            </p>
          </div>

          <div class="nr-msg-chip">
            <span>Recommended Flow</span>
            <strong>Order fulfilled → Wait <b id="flow-delay-preview">14</b> days → Send email</strong>
          </div>
        </header>

        <div class="nr-msg-tabs" role="tablist">
          <button type="button" class="nr-msg-tab-btn active" data-msg-tab="admin">MESSAGING - ADMIN</button>
          <button type="button" class="nr-msg-tab-btn" data-msg-tab="template">MESSAGING TEMPLATE</button>
          <button type="button" class="nr-msg-tab-btn" data-msg-tab="tests">MESSAGING TEST PAGES</button>
        </div>

        <section id="nr-msg-tab-admin" class="nr-msg-tab-panel active">${renderAdminTab()}</section>
        <section id="nr-msg-tab-template" class="nr-msg-tab-panel">${renderTemplateTab()}</section>
        <section id="nr-msg-tab-tests" class="nr-msg-tab-panel">${renderTestsTab()}</section>
      </div>
    `;
  }

  function renderAdminTab() {
    return `
      <div class="nr-msg-grid">
        <div class="nr-msg-grid-one">
          <section class="nr-msg-card nr-msg-card-pad">
            <div class="nr-msg-card-title">
              <span class="nr-msg-step">1</span>
              <div>
                <h2>Email Sending Provider</h2>
                <p>Let each merchant use their own Gmail, Outlook, SendGrid, Postmark, or custom SMTP account.</p>
              </div>
            </div>

            <div style="margin-bottom:14px;">
              <span id="nr-provider-status" class="nr-msg-provider-status not-configured">Not configured</span>
            </div>

            <label for="email-provider">Provider</label>
            <select id="email-provider">
              <option value="none">Not configured</option>
              <option value="gmail">Gmail / Google Workspace</option>
              <option value="outlook">Microsoft 365 / Outlook</option>
              <option value="sendgrid">SendGrid</option>
              <option value="postmark">Postmark</option>
              <option value="custom">Custom SMTP</option>
            </select>

            <div class="nr-msg-help" id="email-provider-help">
              Choose a provider. Gmail / Google Workspace is the easiest no-extra-cost option for low volume.
            </div>

            <div class="nr-msg-two">
              <div>
                <label for="email-smtp-host">SMTP host</label>
                <input id="email-smtp-host" type="text" placeholder="smtp.gmail.com">
              </div>
              <div>
                <label for="email-smtp-port">SMTP port</label>
                <input id="email-smtp-port" type="number" placeholder="587">
              </div>
            </div>

            <label for="email-secure-mode">Security</label>
            <select id="email-secure-mode">
              <option value="starttls">STARTTLS / TLS on port 587</option>
              <option value="ssl">SSL on port 465</option>
              <option value="none">None</option>
            </select>

            <label for="email-smtp-user">SMTP username</label>
            <input id="email-smtp-user" type="text" autocomplete="off" placeholder="you@yourdomain.com">

            <label for="email-smtp-pass">SMTP password / app password / API key</label>
            <input id="email-smtp-pass" type="password" autocomplete="new-password" placeholder="Leave blank to keep existing saved password">
            <p id="email-password-saved-note" style="display:none; margin:6px 0 0; color:#047857; font-weight:750;">A password is already saved. Leave this blank to keep it.</p>

            <div class="nr-msg-two">
              <div>
                <label for="email-from-name">From name</label>
                <input id="email-from-name" type="text" placeholder="Your Store">
              </div>
              <div>
                <label for="email-from-email">From email</label>
                <input id="email-from-email" type="email" placeholder="reviews@yourdomain.com">
              </div>
            </div>

            <label for="email-reply-to">Reply-to email <em>optional</em></label>
            <input id="email-reply-to" type="email" placeholder="support@yourdomain.com">

            <label style="display:flex; gap:10px; align-items:center;">
              <input id="email-provider-enabled" type="checkbox" checked style="width:auto; min-height:auto;">
              Enable sending through this provider
            </label>

            <div class="nr-msg-actions">
              <button class="nr-msg-btn" type="button" data-nr-action="save-email-settings">Save Email Settings</button>
              <button class="nr-msg-secondary-btn" type="button" data-nr-action="clear-email-settings">Clear Credentials</button>
            </div>
          </section>

          <section class="nr-msg-card nr-msg-card-pad">
            <div class="nr-msg-card-title">
              <span class="nr-msg-step">2</span>
              <div>
                <h2>Shopify Flow instructions</h2>
                <p>Use this when installing the email into Shopify Flow.</p>
              </div>
            </div>

            <div class="nr-msg-help" style="margin-top:0;">
              <strong>Workflow:</strong><br>
              Order fulfilled → Wait <b id="flow-delay-copy-preview">14</b> days → Send email
              <br><br>
              In the Send email action, enable HTML and paste the generated code from the right.
            </div>

            <div class="nr-msg-help">
              <strong>Review page handle:</strong><br>
              /pages/<span id="flow-page-handle-preview-admin">leave-review</span>
            </div>

            <div class="nr-msg-actions">
              <button class="nr-msg-btn" type="button" data-nr-action="copy-flow">Copy Email HTML</button>
              <button class="nr-msg-secondary-btn" type="button" data-nr-action="go-template">Edit Template</button>
              <button class="nr-msg-secondary-btn" type="button" data-nr-action="go-tests">Send Test Email</button>
            </div>
          </section>
        </div>

        <section class="nr-msg-card">
          <div class="nr-msg-code-head">
            <div>
              <h2>Copy email HTML</h2>
              <p>Paste this into Shopify Flow's Send email action.</p>
            </div>
            <button class="nr-msg-btn" type="button" data-nr-action="copy-flow">Copy Code</button>
          </div>
          <textarea id="flow-code-output" spellcheck="false"></textarea>
        </section>
      </div>
    `;
  }

  function renderTemplateTab() {
    return `
      <div class="nr-msg-grid">
        <aside class="nr-msg-grid-one">
          <section class="nr-msg-card nr-msg-card-pad">
            <div class="nr-msg-card-title"><span class="nr-msg-step">1</span><div><h2>Brand</h2><p>Logo, colours, and button styling.</p></div></div>
            <label for="flow-logo">Brand logo URL <em>optional</em></label>
            <input id="flow-logo" type="url" placeholder="https://cdn.shopify.com/.../logo.png">

            <div class="nr-msg-two">
              <div><label for="flow-color">Button colour</label><input id="flow-color" type="color" value="#111827"></div>
              <div><label for="flow-button-radius">Button radius</label><input id="flow-button-radius" type="number" min="0" max="40" value="8"></div>
            </div>

            <div class="nr-msg-two">
              <div><label for="flow-bg-color">Email background</label><input id="flow-bg-color" type="color" value="#f3f4f6"></div>
              <div><label for="flow-card-color">Email card</label><input id="flow-card-color" type="color" value="#ffffff"></div>
            </div>
          </section>

          <section class="nr-msg-card nr-msg-card-pad">
            <div class="nr-msg-card-title"><span class="nr-msg-step">2</span><div><h2>Email copy</h2><p>Editable copy for merchants.</p></div></div>

            <label for="flow-subject">Email subject</label>
            <input id="flow-subject" type="text" value="How did we do?">

            <label for="flow-heading">Heading</label>
            <input id="flow-heading" type="text" value="How did we do?">

            <label for="flow-intro">Intro line</label>
            <input id="flow-intro" type="text" value='Hi {{ order.customer.firstName | default: "there" }},'>

            <label for="flow-body">Main message</label>
            <textarea id="flow-body" rows="4">We hope you're loving your recent purchase. Could you take 60 seconds to leave a quick review?</textarea>

            <label for="flow-signoff">Footer note</label>
            <input id="flow-signoff" type="text" value="Your feedback helps other customers make confident choices.">
          </section>

          <section class="nr-msg-card nr-msg-card-pad">
            <div class="nr-msg-card-title"><span class="nr-msg-step">3</span><div><h2>Review links</h2><p>Choose how customers leave reviews.</p></div></div>

            <label for="flow-link-mode">Review link style</label>
            <select id="flow-link-mode">
              <option value="both">Order button + individual product links</option>
              <option value="order">Review entire order only</option>
              <option value="products">Review each product only</option>
            </select>

            <label for="flow-main-button-text">Main button text</label>
            <input id="flow-main-button-text" type="text" value="Review Your Order">

            <label for="flow-product-button-text">Product button text</label>
            <input id="flow-product-button-text" type="text" value="Review This Item">

            <label for="flow-page-handle">Review landing page handle</label>
            <input id="flow-page-handle" type="text" value="leave-review">
          </section>

          <section class="nr-msg-card nr-msg-card-pad">
            <div class="nr-msg-card-title"><span class="nr-msg-step">4</span><div><h2>Flow setup</h2><p>The wait step happens in Shopify Flow.</p></div></div>

            <label for="flow-delay-days">Recommended wait after fulfilment</label>
            <select id="flow-delay-days">
              <option value="7">7 days</option>
              <option value="10">10 days</option>
              <option value="14" selected>14 days</option>
              <option value="21">21 days</option>
              <option value="30">30 days</option>
            </select>
          </section>
        </aside>

        <main class="nr-msg-grid-one">
          <section class="nr-msg-card">
            <div class="nr-msg-preview-head">
              <div><h2>Live preview</h2><p>Check the customer email on desktop and mobile.</p></div>
              <div class="nr-msg-toggle">
                <button type="button" id="flow-preview-desktop" class="active" data-nr-preview="desktop">Desktop</button>
                <button type="button" id="flow-preview-mobile" data-nr-preview="mobile">Mobile</button>
              </div>
            </div>
            <div class="nr-msg-preview-stage"><div id="flow-preview-wrap" class="nr-msg-preview-wrap"><div id="flow-email-preview"></div></div></div>
          </section>
        </main>
      </div>
    `;
  }

  function renderTestsTab() {
    return `
      <div class="nr-msg-grid">
        <aside class="nr-msg-grid-one">
          <section class="nr-msg-card nr-msg-card-pad">
            <div class="nr-msg-card-title"><span class="nr-msg-step">1</span><div><h2>Review test page</h2><p>Open your review landing page with fake order/product data.</p></div></div>

            <label for="review-test-name">Customer name</label>
            <input id="review-test-name" type="text" value="Alex">

            <label for="review-test-email">Customer email</label>
            <input id="review-test-email" type="email" value="alex@example.com">

            <label for="review-test-order">Order number</label>
            <input id="review-test-order" type="text" value="1001">

            <label for="review-test-type">Review mode</label>
            <select id="review-test-type">
              <option value="order">Review full order</option>
              <option value="product">Review one product</option>
            </select>

            <label for="review-test-count">How many products?</label>
            <input id="review-test-count" type="number" min="1" max="10" value="2">

            <label for="nr-product-search">Search products <em>optional</em></label>
            <input id="nr-product-search" type="text" placeholder="Search product title or handle">

            <div class="nr-msg-actions">
              <button class="nr-msg-secondary-btn" type="button" data-nr-action="search-products">Search Products</button>
              <button class="nr-msg-secondary-btn" type="button" data-nr-action="manual-product">Add Manual Product</button>
            </div>

            <div id="nr-product-search-results" class="nr-product-search-results"></div>

            <div class="nr-review-test-actions">
              <button class="nr-msg-secondary-btn" type="button" data-nr-action="pick-products">Select Products</button>
              <button class="nr-msg-secondary-btn" type="button" data-nr-action="sample-products">Use Sample Products</button>
            </div>

            <div id="review-test-products" class="nr-review-test-products"></div>

            <button class="nr-msg-btn" type="button" style="width:100%; margin-top:16px;" data-nr-action="open-review-test">
              Open Test Review Page
            </button>
          </section>

          <section class="nr-msg-card nr-msg-card-pad">
            <div class="nr-msg-card-title"><span class="nr-msg-step">2</span><div><h2>Send test email</h2><p>Send the generated email using the saved provider credentials.</p></div></div>

            <label for="test-email-to">Send to</label>
            <input id="test-email-to" type="email" placeholder="you@example.com">

            <label for="test-email-name">Customer name shown in preview</label>
            <input id="test-email-name" type="text" value="Alex">

            <label for="test-email-order">Order number shown in links</label>
            <input id="test-email-order" type="text" value="1001">

            <div class="nr-msg-help">
              This uses the current template and your saved Email Sending Provider settings. If the provider is not configured, the app opens a manual draft fallback.
            </div>

            <button id="nr-send-test-email-btn" class="nr-msg-btn" type="button" style="width:100%; margin-top:16px;" data-nr-action="send-test-email">
              Send Test Email
            </button>

            <div id="nr-test-email-result" class="nr-test-email-result"></div>
          </section>
        </aside>

        <main class="nr-msg-grid-one">
          <section class="nr-msg-card">
            <div class="nr-msg-preview-head">
              <div><h2>Test email preview</h2><p>This is the email that will be sent or opened as a draft.</p></div>
              <button class="nr-msg-secondary-btn" type="button" data-nr-action="go-template">Edit Template</button>
            </div>
            <div class="nr-msg-preview-stage"><div id="flow-email-preview-test"></div></div>
          </section>
        </main>
      </div>
    `;
  }

  function providerHelp(provider) {
    if (provider === 'gmail') return 'Gmail / Google Workspace: use smtp.gmail.com, port 587, STARTTLS. Use a Google App Password, not your normal Google password.';
    if (provider === 'outlook') return 'Microsoft 365 / Outlook: use smtp.office365.com, port 587, STARTTLS. SMTP AUTH may need to be enabled for the mailbox.';
    if (provider === 'sendgrid') return 'SendGrid: use smtp.sendgrid.net, port 587, username apikey, and your SendGrid API key as the password. Sender must be verified in SendGrid.';
    if (provider === 'postmark') return 'Postmark: use smtp.postmarkapp.com, port 587. Use your Postmark Server API Token for username and password.';
    if (provider === 'custom') return 'Custom SMTP: enter the host, port, security type, username, password, and sender details from your email provider.';
    return 'Choose a provider. Gmail / Google Workspace is the easiest no-extra-cost option for low volume.';
  }

  function applyProviderPreset(provider) {
    const preset = providerPresets[provider] || providerPresets.none;

    setValue('email-smtp-host', preset.smtpHost);
    setValue('email-smtp-port', preset.smtpPort);
    setValue('email-secure-mode', preset.secureMode);
    setValue('email-smtp-user', preset.smtpUser);
    setValue('email-smtp-pass', '');

    updateProviderHelp();
  }

  function updateProviderHelp() {
    const provider = value('email-provider', 'none');
    const help = document.getElementById('email-provider-help');
    if (help) help.textContent = providerHelp(provider);
  }

  function updateProviderStatus(status, text) {
    const el = document.getElementById('nr-provider-status');
    if (!el) return;

    el.className = `nr-msg-provider-status ${status}`;
    el.textContent = text;
  }

  async function loadEmailSettings() {
    try {
      const res = await fetchWithTimeout(`/api/admin/email-settings?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&t=${Date.now()}`, {}, 12000);

      if (!res.ok) throw new Error('Email settings endpoint not installed');

      const data = await res.json();

      setValue('email-provider', data.provider || 'none');
      setChecked('email-provider-enabled', data.enabled !== false);
      setValue('email-smtp-host', data.smtpHost || '');
      setValue('email-smtp-port', data.smtpPort || '');
      setValue('email-secure-mode', data.secureMode || 'starttls');
      setValue('email-smtp-user', data.smtpUser || '');
      setValue('email-from-name', data.fromName || '');
      setValue('email-from-email', data.fromEmail || '');
      setValue('email-reply-to', data.replyToEmail || '');

      const savedNote = document.getElementById('email-password-saved-note');
      if (savedNote) savedNote.style.display = data.smtpPasswordSet ? 'block' : 'none';

      if (data.provider && data.provider !== 'none' && data.smtpPasswordSet) {
        updateProviderStatus('connected', data.lastTestStatus === 'failed' ? 'Credentials saved — last test failed' : 'Credentials saved');
      } else {
        updateProviderStatus('not-configured', 'Not configured');
      }

      updateProviderHelp();
      emailSettingsLoaded = true;
    } catch (error) {
      console.warn(error);
      updateProviderStatus('failed', 'Settings endpoint missing');

      const help = document.getElementById('email-provider-help');
      if (help) help.textContent = 'The backend email settings endpoint is not installed yet. Install the server update before saving credentials.';
    }
  }

  async function saveEmailSettings() {
    const payload = {
      shopDomain: SHOP_DOMAIN,
      enabled: checked('email-provider-enabled'),
      provider: value('email-provider', 'none'),
      smtpHost: value('email-smtp-host'),
      smtpPort: parseInt(value('email-smtp-port', '587'), 10) || 587,
      secureMode: value('email-secure-mode', 'starttls'),
      smtpUser: value('email-smtp-user'),
      smtpPass: value('email-smtp-pass'),
      fromName: value('email-from-name'),
      fromEmail: value('email-from-email'),
      replyToEmail: value('email-reply-to')
    };

    if (payload.provider === 'none') {
      toast('Choose an email provider first.');
      return;
    }

    if (!payload.smtpHost || !payload.smtpUser || !payload.fromEmail) {
      toast('SMTP host, username, and from email are required.');
      return;
    }

    try {
      updateProviderStatus('not-configured', 'Saving...');

      const res = await fetchWithTimeout('/api/admin/email-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 20000);

      const result = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(result.error || 'Could not save email settings');

      setValue('email-smtp-pass', '');

      const savedNote = document.getElementById('email-password-saved-note');
      if (savedNote) savedNote.style.display = 'block';

      updateProviderStatus('connected', 'Credentials saved');
      toast('Email settings saved.');
    } catch (error) {
      console.error(error);
      updateProviderStatus('failed', 'Save failed');
      toast(error.message || 'Could not save email settings.');
    }
  }

  async function clearEmailSettings() {
    if (!confirm('Clear saved email credentials for this shop?')) return;

    try {
      const res = await fetchWithTimeout('/api/admin/email-settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: SHOP_DOMAIN })
      }, 12000);

      const result = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(result.error || 'Could not clear settings');

      applyProviderPreset('none');
      setValue('email-provider', 'none');
      setChecked('email-provider-enabled', false);

      const savedNote = document.getElementById('email-password-saved-note');
      if (savedNote) savedNote.style.display = 'none';

      updateProviderStatus('not-configured', 'Not configured');
      toast('Email credentials cleared.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Could not clear credentials.');
    }
  }

  function getTemplateOptions() {
    return {
      logo: value('flow-logo', ''),
      accentColor: value('flow-color', '#111827'),
      bgColor: value('flow-bg-color', '#f3f4f6'),
      cardColor: value('flow-card-color', '#ffffff'),
      buttonRadius: Math.max(0, Math.min(40, parseInt(value('flow-button-radius', '8'), 10) || 8)),
      subject: value('flow-subject', 'How did we do?'),
      heading: value('flow-heading', 'How did we do?'),
      intro: value('flow-intro', 'Hi {{ order.customer.firstName | default: "there" }},'),
      body: value('flow-body', "We hope you're loving your recent purchase. Could you take 60 seconds to leave a quick review?"),
      signoff: value('flow-signoff', 'Your feedback helps other customers make confident choices.'),
      linkMode: value('flow-link-mode', 'both'),
      mainButtonText: value('flow-main-button-text', 'Review Your Order'),
      productButtonText: value('flow-product-button-text', 'Review This Item'),
      pageHandle: cleanHandle(value('flow-page-handle', 'leave-review')),
      delayDays: value('flow-delay-days', '14')
    };
  }

  function buildEmailHtml(options, mode = 'liquid') {
    const shopUrl = `https://${SHOP_DOMAIN}`;
    const isTest = mode === 'test';

    const customerName = value('test-email-name', 'Alex');
    const orderNumber = value('test-email-order', '1001').replace(/^#/, '');

    const intro = isTest ? `Hi ${escapeHtml(customerName)},` : options.intro;
    const orderValue = isTest ? encodeURIComponent(orderNumber) : `{{ order.name | remove: '#' | url_encode }}`;
    const emailValue = isTest ? encodeURIComponent(value('test-email-to', 'test@example.com')) : `{{ order.customer.email | url_encode }}`;

    const logoHtml = options.logo ? `
                            <tr>
                                <td align="center" style="padding:0 0 24px 0;">
                                    <img src="${escapeHtml(options.logo)}" alt="{{ shop.name }}" style="display:block; max-width:160px; height:auto; border:0; outline:none; text-decoration:none;">
                                </td>
                            </tr>` : '';

    const orderReviewUrl = `${shopUrl}/pages/${options.pageHandle}?review_type=order&order=${orderValue}&email=${emailValue}`;

    const orderButtonHtml = `
                            <tr>
                                <td align="center" style="padding:22px 0 8px 0;">
                                    <a href="${orderReviewUrl}" style="display:inline-block; background:${options.accentColor}; color:#ffffff; text-decoration:none; font-size:16px; font-weight:bold; padding:14px 24px; border-radius:${options.buttonRadius}px; line-height:1.2;">
                                        ${escapeHtml(options.mainButtonText)}
                                    </a>
                                </td>
                            </tr>`;

    let productLinksHtml = '';

    if (isTest) {
      const products = reviewTestProducts.length ? reviewTestProducts : sampleProducts(2, false);

      productLinksHtml = `
                            <tr>
                                <td style="padding:24px 0 0 0;">
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                        ${products.map((product) => `
                                            <tr>
                                                <td style="padding:14px 0; border-top:1px solid #e5e7eb;">
                                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                                        <tr>
                                                            <td style="font-size:15px; font-weight:bold; color:#111827; line-height:1.4; padding:0 0 8px 0;">
                                                                ${escapeHtml(product.title)}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td>
                                                                <a href="${shopUrl}/pages/${options.pageHandle}?review_type=product&order=${orderValue}&email=${emailValue}&product_id=${encodeURIComponent(product.id)}&variant_id=${encodeURIComponent(product.variantId || '')}" style="display:inline-block; background:${options.accentColor}; color:#ffffff; text-decoration:none; font-size:14px; font-weight:bold; padding:10px 16px; border-radius:${options.buttonRadius}px; line-height:1.2;">
                                                                    ${escapeHtml(options.productButtonText)}
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>`).join('')}
                                    </table>
                                </td>
                            </tr>`;
    } else {
      productLinksHtml = `
                            <tr>
                                <td style="padding:24px 0 0 0;">
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                        {% for line_item in order.line_items %}
                                            <tr>
                                                <td style="padding:14px 0; border-top:1px solid #e5e7eb;">
                                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                                        <tr>
                                                            <td style="font-size:15px; font-weight:bold; color:#111827; line-height:1.4; padding:0 0 8px 0;">
                                                                {{ line_item.title | default: line_item.name }}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td>
                                                                <a href="${shopUrl}/pages/${options.pageHandle}?review_type=product&order={{ order.name | remove: '#' | url_encode }}&email={{ order.customer.email | url_encode }}&product_id={{ line_item.product.id }}&variant_id={{ line_item.variant.id }}" style="display:inline-block; background:${options.accentColor}; color:#ffffff; text-decoration:none; font-size:14px; font-weight:bold; padding:10px 16px; border-radius:${options.buttonRadius}px; line-height:1.2;">
                                                                    ${escapeHtml(options.productButtonText)}
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        {% endfor %}
                                    </table>
                                </td>
                            </tr>`;
    }

    let reviewLinks = '';
    if (options.linkMode === 'order') reviewLinks = orderButtonHtml;
    else if (options.linkMode === 'products') reviewLinks = productLinksHtml;
    else reviewLinks = orderButtonHtml + productLinksHtml;

    return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${options.bgColor}; margin:0; padding:0; width:100%;">
    <tr>
        <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background:${options.cardColor}; border-radius:12px; overflow:hidden;">
                <tr>
                    <td style="padding:32px 24px; font-family:Arial, Helvetica, sans-serif; text-align:center;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            ${logoHtml}
                            <tr>
                                <td align="center" style="padding:0 0 12px 0;">
                                    <h1 style="margin:0; color:#111827; font-size:26px; line-height:1.25; font-weight:700;">${escapeHtml(options.heading)}</h1>
                                </td>
                            </tr>
                            <tr>
                                <td align="center" style="padding:0 0 10px 0;">
                                    <p style="margin:0; color:#4b5563; font-size:16px; line-height:1.6;">${intro}</p>
                                </td>
                            </tr>
                            <tr>
                                <td align="center" style="padding:0 0 8px 0;">
                                    <p style="margin:0; color:#4b5563; font-size:16px; line-height:1.6;">${escapeHtml(options.body)}</p>
                                </td>
                            </tr>
                            ${reviewLinks}
                            <tr>
                                <td align="center" style="padding:24px 0 0 0;">
                                    <p style="margin:0; color:#6b7280; font-size:13px; line-height:1.5;">${escapeHtml(options.signoff)}</p>
                                </td>
                            </tr>
                            <tr>
                                <td align="center" style="padding:20px 0 0 0;">
                                    <p style="margin:0; color:#9ca3af; font-size:12px; line-height:1.5;">Sent by ${isTest ? escapeHtml(SHOP_DOMAIN) : '{{ shop.name }}'}.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>`.trim();
  }

  function setPreviewMode(mode) {
    const wrap = document.getElementById('flow-preview-wrap');
    const desktopBtn = document.getElementById('flow-preview-desktop');
    const mobileBtn = document.getElementById('flow-preview-mobile');

    if (wrap) wrap.classList.toggle('mobile', mode === 'mobile');
    if (desktopBtn) desktopBtn.classList.toggle('active', mode === 'desktop');
    if (mobileBtn) mobileBtn.classList.toggle('active', mode === 'mobile');
  }

  function updateAllMessaging() {
    const options = getTemplateOptions();

    const pageHandlePreviewAdmin = document.getElementById('flow-page-handle-preview-admin');
    if (pageHandlePreviewAdmin) pageHandlePreviewAdmin.textContent = options.pageHandle;

    const delayPreview = document.getElementById('flow-delay-preview');
    if (delayPreview) delayPreview.textContent = options.delayDays;

    const delayCopyPreview = document.getElementById('flow-delay-copy-preview');
    if (delayCopyPreview) delayCopyPreview.textContent = options.delayDays;

    const flowOutput = document.getElementById('flow-code-output');
    if (flowOutput) flowOutput.value = buildEmailHtml(options, 'liquid');

    const flowPreview = document.getElementById('flow-email-preview');
    if (flowPreview) flowPreview.innerHTML = buildEmailHtml(options, 'test');

    const testPreview = document.getElementById('flow-email-preview-test');
    if (testPreview) testPreview.innerHTML = buildEmailHtml(options, 'test');
  }

  function sampleProducts(count, shouldRender = true) {
    const products = Array.from({ length: count }).map((_, index) => ({
      id: `sample-product-${index + 1}`,
      variantId: `sample-variant-${index + 1}`,
      title: `Sample Product ${index + 1}`,
      handle: `sample-product-${index + 1}`,
      image: '',
      quantity: 1,
      tags: [],
      metafields: {}
    }));

    if (shouldRender) {
      reviewTestProducts = products;
      renderTestProducts();
      updateAllMessaging();
    }

    return products;
  }

  function getTestCount() {
    return Math.max(1, Math.min(10, parseInt(value('review-test-count', '2'), 10) || 2));
  }

  function generateSampleProducts() {
    sampleProducts(getTestCount(), true);
  }

  function addProductToTest(product) {
    if (!product || !product.id) return;

    const exists = reviewTestProducts.some((p) => String(p.id) === String(product.id));
    if (!exists) reviewTestProducts.push(product);

    renderTestProducts();
    updateAllMessaging();
  }

  async function pickProducts() {
    const count = getTestCount();
    const bridge = await getShopifyResourcePickerBridge();

    if (!bridge) {
      toast('Shopify App Bridge resource picker is not ready. Use Search Products or check App Bridge setup.');
      return;
    }

    try {
      const result = await bridge.resourcePicker({
        type: 'product',
        multiple: true,
        action: 'select'
      });

      const selectedProducts = normalizeResourcePickerSelection(result).slice(0, count);

      if (!selectedProducts.length) {
        toast('No products selected.');
        return;
      }

      reviewTestProducts = selectedProducts;
      renderTestProducts();
      updateAllMessaging();
      toast(`${selectedProducts.length} product${selectedProducts.length === 1 ? '' : 's'} selected.`);
    } catch (error) {
      console.error(error);
      toast(error && error.message ? error.message : 'Product picker closed or failed.');
    }
  }

  async function searchProducts() {
    const query = value('nr-product-search');
    const resultsEl = document.getElementById('nr-product-search-results');

    if (!resultsEl) return;

    if (!query) {
      resultsEl.innerHTML = '<div class="nr-msg-help">Enter a product title, handle, or product ID to search.</div>';
      return;
    }

    resultsEl.innerHTML = '<div class="nr-msg-help">Searching products...</div>';

    try {
      const response = await fetchWithTimeout(`/api/admin/products/search?shopDomain=${encodeURIComponent(SHOP_DOMAIN)}&q=${encodeURIComponent(query)}`, {}, 15000);
      const result = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(result.error || 'Product search backend route is not installed yet.');

      const products = Array.isArray(result.products) ? result.products : [];

      if (!products.length) {
        resultsEl.innerHTML = '<div class="nr-msg-help">No matching products found.</div>';
        return;
      }

      window.__nrProductSearchResults = products;

      resultsEl.innerHTML = products.map((product, index) => `
        <div class="nr-product-search-result">
          ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<div class="nr-review-test-placeholder" style="width:42px;height:42px;"></div>'}
          <div>
            <strong>${escapeHtml(product.title)}</strong>
            <span style="display:block;color:#6b7280;font-size:12px;">ID: ${escapeHtml(product.id)}</span>
            ${Array.isArray(product.tags) && product.tags.length ? `<span style="display:block;color:#6b7280;font-size:12px;">Tags: ${escapeHtml(product.tags.join(', '))}</span>` : ''}
          </div>
          <button class="nr-msg-secondary-btn" type="button" data-nr-add-search-product="${index}">Add</button>
        </div>
      `).join('');
    } catch (error) {
      console.error(error);

      resultsEl.innerHTML = `
        <div class="nr-msg-help">
          Product search is not available yet. Use <strong>Select Products</strong> if App Bridge is ready, or <strong>Add Manual Product</strong>.
          <br>Error: ${escapeHtml(error.message)}
        </div>
      `;
    }
  }

  function addManualProduct() {
    const title = prompt('Product title for the preview:', 'Manual Preview Product');
    if (!title) return;

    const id = prompt('Product ID for the preview:', `manual-${Date.now()}`);
    if (!id) return;

    const variantId = prompt('Variant ID, optional:', '') || '';
    const tagsRaw = prompt('Preview tags, optional. Separate with commas. Example: Drink, Skincare', '') || '';

    addProductToTest({
      id,
      variantId,
      title,
      handle: '',
      image: '',
      quantity: 1,
      tags: tagsRaw.split(',').map((tag) => tag.trim()).filter(Boolean),
      metafields: {}
    });
  }

  function renderTestProducts() {
    const container = document.getElementById('review-test-products');
    if (!container) return;

    if (!reviewTestProducts.length) {
      container.innerHTML = '<div class="nr-msg-help">No products selected yet.</div>';
      return;
    }

    container.innerHTML = reviewTestProducts.map((product, index) => `
      <div class="nr-review-test-product">
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<div class="nr-review-test-placeholder"></div>'}
        <div>
          <strong>${escapeHtml(product.title)}</strong>
          <span>Product ID: ${escapeHtml(product.id)}</span>
          ${product.variantId ? `<span>Variant ID: ${escapeHtml(product.variantId)}</span>` : ''}
          ${Array.isArray(product.tags) && product.tags.length ? `<span>Preview tags: ${escapeHtml(product.tags.join(', '))}</span>` : ''}
          <button type="button" style="margin-top:6px; border:0; background:transparent; color:#d72c0d; cursor:pointer; font-weight:800; padding:0;" data-nr-remove-product="${index}">Remove</button>
        </div>
      </div>
    `).join('');
  }

  function encodePreviewData(data) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function getPreviewPayload() {
    const name = value('review-test-name', value('test-email-name', 'Alex'));
    const email = value('review-test-email', value('test-email-to', 'alex@example.com'));
    const orderNumber = value('review-test-order', value('test-email-order', '1001')).replace(/^#/, '');
    const reviewType = value('review-test-type', 'order');

    if (!reviewTestProducts.length) generateSampleProducts();

    return {
      preview: true,
      reviewType,
      customer: { name, email },
      order: {
        name: `#${orderNumber}`,
        number: orderNumber,
        fulfilledAt: new Date().toISOString()
      },
      products: reviewType === 'product' ? reviewTestProducts.slice(0, 1) : reviewTestProducts
    };
  }

  function openReviewTestPage() {
    const options = getTemplateOptions();
    const encoded = encodePreviewData(getPreviewPayload());
    const url = `https://${SHOP_DOMAIN}/pages/${options.pageHandle}?preview=true&preview_data=${encoded}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyFlowCode() {
    const output = document.getElementById('flow-code-output');
    if (!output) return;

    output.select();
    output.setSelectionRange(0, 999999);

    try {
      await navigator.clipboard.writeText(output.value);
    } catch (error) {
      document.execCommand('copy');
    }

    toast('Email HTML copied.');
  }

  function setTestEmailResult(type, message) {
    const box = document.getElementById('nr-test-email-result');
    if (!box) return;

    box.className = `nr-test-email-result ${type}`;
    box.innerHTML = message;
  }

  async function sendTestEmail() {
    const options = getTemplateOptions();
    const to = value('test-email-to');
    const btn = document.getElementById('nr-send-test-email-btn');

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setTestEmailResult('error', 'Please enter a valid test email address.');
      return;
    }

    const subject = options.subject || 'How did we do?';
    const html = buildEmailHtml(options, 'test');

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending...';
    }

    setTestEmailResult('warn', 'Sending test email. This can take a few seconds...');

    try {
      const response = await fetchWithTimeout('/api/admin/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: SHOP_DOMAIN, to, subject, html, previewData: getPreviewPayload() })
      }, 25000);

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || `Send failed with status ${response.status}`);
      }

      setTestEmailResult('success', `Test email sent to <strong>${escapeHtml(to)}</strong>. Check inbox and spam/junk.`);
      toast('Test email sent.');
      loadEmailSettings();
    } catch (error) {
      console.error(error);

      const message = error.name === 'AbortError'
        ? 'The email send timed out after 25 seconds. Check Render logs and Gmail app-password settings.'
        : error.message || 'Could not send test email.';

      setTestEmailResult(
        'error',
        `${escapeHtml(message)}<br><br>If this is Gmail, check that you used a Google App Password and that From Email matches the authenticated mailbox or a valid send-as alias.`
      );
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send Test Email';
      }
    }
  }

  function switchTab(tab) {
    currentMsgTab = tab;

    document.querySelectorAll('.nr-msg-tab-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.msgTab === tab);
    });

    document.querySelectorAll('.nr-msg-tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `nr-msg-tab-${tab}`);
    });

    updateAllMessaging();

    if (tab === 'admin' && !emailSettingsLoaded) {
      loadEmailSettings();
    }
  }

  function bindEvents() {
    const shell = document.querySelector('.nr-msg-shell');
    if (!shell) return;

    shell.addEventListener('input', (event) => {
      if (event.target.matches('input, textarea, select')) updateAllMessaging();
    });

    shell.addEventListener('change', (event) => {
      if (event.target.id === 'email-provider') {
        applyProviderPreset(event.target.value);
      }

      if (event.target.matches('input, textarea, select')) updateAllMessaging();
    });

    shell.addEventListener('click', (event) => {
      const addSearchButton = event.target.closest('[data-nr-add-search-product]');
      if (addSearchButton) {
        const index = parseInt(addSearchButton.dataset.nrAddSearchProduct, 10);
        const product = window.__nrProductSearchResults && window.__nrProductSearchResults[index];
        addProductToTest(product);
        return;
      }

      const removeButton = event.target.closest('[data-nr-remove-product]');
      if (removeButton) {
        const index = parseInt(removeButton.dataset.nrRemoveProduct, 10);
        reviewTestProducts.splice(index, 1);
        renderTestProducts();
        updateAllMessaging();
        return;
      }

      const tabButton = event.target.closest('[data-msg-tab]');
      if (tabButton) {
        switchTab(tabButton.dataset.msgTab);
        return;
      }

      const previewButton = event.target.closest('[data-nr-preview]');
      if (previewButton) {
        setPreviewMode(previewButton.dataset.nrPreview);
        return;
      }

      const actionButton = event.target.closest('[data-nr-action]');
      if (!actionButton) return;

      const action = actionButton.dataset.nrAction;

      if (action === 'copy-flow') copyFlowCode();
      if (action === 'go-template') switchTab('template');
      if (action === 'go-tests') switchTab('tests');
      if (action === 'pick-products') pickProducts();
      if (action === 'sample-products') generateSampleProducts();
      if (action === 'open-review-test') openReviewTestPage();
      if (action === 'send-test-email') sendTestEmail();
      if (action === 'save-email-settings') saveEmailSettings();
      if (action === 'clear-email-settings') clearEmailSettings();
      if (action === 'search-products') searchProducts();
      if (action === 'manual-product') addManualProduct();
    });
  }

  function init() {
    injectStyles();

    const container = findContainer();

    if (!container) {
      console.warn('[Nectar Reviews] Messaging container not found.');
      return;
    }

    container.innerHTML = renderShell();

    bindEvents();
    generateSampleProducts();
    switchTab(currentMsgTab);
    updateAllMessaging();
    loadEmailSettings();

    console.log('[Nectar Reviews] Messaging full restored file mounted.');
  }

  window.generateFlowCode = updateAllMessaging;
  window.copyFlowCode = copyFlowCode;
  window.setFlowPreviewMode = setPreviewMode;
  window.generateSampleReviewProducts = generateSampleProducts;
  window.pickReviewTestProducts = pickProducts;
  window.openReviewPageTest = openReviewTestPage;
  window.sendNectarTestEmail = sendTestEmail;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
