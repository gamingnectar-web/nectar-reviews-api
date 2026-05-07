/*
  Nectar Reviews — Email Tracking Enhancer
  File: public/admin-email-tracking-enhancer.js

  Load after admin-messaging-campaigns.js:
  <script src="/admin-email-tracking-enhancer.js?v=1"></script>

  It enhances the generated Shopify Flow email HTML by adding:
  - open tracking pixel
  - tracked review links
  - Flow HTTP request setup helper for sent tracking
*/
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const SHOP = window.SHOP_DOMAIN || params.get('shop') || 'your-dev-store.myshopify.com';
  const APP_ORIGIN = window.location.origin;

  function injectStyles() {
    if (document.getElementById('nr-email-tracking-style')) return;
    const style = document.createElement('style');
    style.id = 'nr-email-tracking-style';
    style.textContent = `
      .nr-tracking-helper {
        margin-top: 16px;
        padding: 14px;
        border: 1px solid #fed7aa;
        background: #fff7ed;
        border-radius: 12px;
        color: #9a3412;
        font-size: 13px;
        line-height: 1.5;
      }
      .nr-tracking-helper strong { color: #7c2d12; }
      .nr-tracking-helper textarea {
        width: 100%;
        min-height: 92px;
        margin-top: 10px;
        box-sizing: border-box;
        border: 1px solid #fdba74;
        border-radius: 10px;
        background: #fff;
        color: #111827;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
      }
    `;
    document.head.appendChild(style);
  }

  function openPixelHtml() {
    const token = '{{ order.id }}-{{ order.customer.email | default: order.email | url_encode }}';
    const url = `${APP_ORIGIN}/api/campaign-events/open.gif?shopDomain=${encodeURIComponent(SHOP)}&campaign=review_request&orderId={{ order.name | remove: '#' | url_encode }}&email={{ order.customer.email | default: order.email | url_encode }}&token=${token}`;
    return `<img src="${url}" width="1" height="1" alt="" style="display:none!important; width:1px!important; height:1px!important; opacity:0!important; overflow:hidden!important; border:0!important;">`;
  }

  function trackingClickUrl(originalUrl, itemIdLiquid) {
    const token = '{{ order.id }}-{{ order.customer.email | default: order.email | url_encode }}';
    return `${APP_ORIGIN}/api/campaign-events/click?shopDomain=${encodeURIComponent(SHOP)}&campaign=review_request&orderId={{ order.name | remove: '#' | url_encode }}&email={{ order.customer.email | default: order.email | url_encode }}&itemId=${itemIdLiquid || ''}&token=${token}&url=${encodeURIComponent(originalUrl)}`;
  }

  function enhanceHtml(html) {
    if (!html || html.includes('/api/campaign-events/open.gif')) return html;

    let next = html;

    // Track review order links.
    next = next.replace(/href="(https:\/\/[^"<>]+\/pages\/[^"<>]+review_type=order[^"<>]*)"/g, function (_, url) {
      return `href="${trackingClickUrl(url, '')}"`;
    });

    // Track review product links.
    next = next.replace(/href="(https:\/\/[^"<>]+\/pages\/[^"<>]+review_type=product[^"<>]*)"/g, function (_, url) {
      return `href="${trackingClickUrl(url, '{{ line_item.product.id }}')}"`;
    });

    // Add open pixel at the end of the outer email table.
    next = `${next}\n${openPixelHtml()}`;
    return next;
  }

  function updateOutput() {
    const output = document.getElementById('flow-code-output');
    if (!output || !output.value) return;
    output.value = enhanceHtml(output.value);
  }

  function flowSentBody() {
    return JSON.stringify({
      shopDomain: SHOP,
      campaign: 'review_request',
      orderId: '{{ order.name | remove: "#" }}',
      email: '{{ order.customer.email | default: order.email }}',
      token: '{{ order.id }}-{{ order.customer.email | default: order.email }}'
    }, null, 2);
  }

  function renderHelper() {
    const existing = document.getElementById('nr-tracking-helper');
    if (existing) return;

    const output = document.getElementById('flow-code-output');
    if (!output) return;

    const helper = document.createElement('div');
    helper.id = 'nr-tracking-helper';
    helper.className = 'nr-tracking-helper';
    helper.innerHTML = `
      <strong>Email tracking setup:</strong><br>
      Opens and clicks are automatically added to the copied HTML. To count <strong>emails sent</strong>, add a Shopify Flow <strong>Send HTTP request</strong> action immediately before the Send email step.
      <br><br>
      <strong>POST URL:</strong><br>
      <code>${APP_ORIGIN}/api/campaign-events/sent</code>
      <br><br>
      <strong>Body:</strong>
      <textarea readonly>${flowSentBody()}</textarea>
    `;

    const card = output.closest('.nr-msg-card') || output.parentElement;
    if (card) card.appendChild(helper);
  }

  function patchGenerateFlowCode() {
    if (typeof window.generateFlowCode !== 'function' || window.generateFlowCode.__nrTrackingPatched) return;

    const original = window.generateFlowCode;
    const patched = function () {
      const result = original.apply(this, arguments);
      setTimeout(updateOutput, 0);
      setTimeout(renderHelper, 0);
      return result;
    };

    patched.__nrTrackingPatched = true;
    window.generateFlowCode = patched;
  }

  function init() {
    injectStyles();
    patchGenerateFlowCode();
    updateOutput();
    renderHelper();

    document.addEventListener('input', function (event) {
      if (event.target && event.target.id && event.target.id.startsWith('flow-')) {
        setTimeout(updateOutput, 20);
      }
    });

    document.addEventListener('change', function (event) {
      if (event.target && event.target.id && event.target.id.startsWith('flow-')) {
        setTimeout(updateOutput, 20);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
