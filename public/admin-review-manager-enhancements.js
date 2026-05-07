/*
  Nectar Reviews — Admin review manager enhancements
  File: public/admin-review-manager-enhancements.js

  Load after admin.js:
  <script src="/admin-review-manager-enhancements.js?v=3"></script>
*/
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const SHOP = window.SHOP_DOMAIN || params.get('shop') || 'your-dev-store.myshopify.com';
  const API_BASE = window.API || 'https://nectar-reviews-api.onrender.com/api';

  let latestSeenCreatedAt = null;
  let pendingReviewCount = 0;
  let pollTimer = null;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function asAttributeObject(attributes) {
    if (!attributes) return {};
    if (attributes instanceof Map) return Object.fromEntries(attributes.entries());
    return attributes;
  }

  function ensureStyles() {
    if (document.getElementById('nr-review-manager-enhancements-style')) return;
    const style = document.createElement('style');
    style.id = 'nr-review-manager-enhancements-style';
    style.textContent = `
      .nr-review-bell {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: 8px;
        padding: 4px 8px;
        border-radius: 999px;
        background: #fff7ed;
        color: #c2410c;
        border: 1px solid #fed7aa;
        font-size: 12px;
        font-weight: 800;
        vertical-align: middle;
      }
      .nr-review-bell[data-count="0"], .nr-review-bell.is-hidden { display: none; }
      .nr-verify-clickable { cursor: pointer; transition: transform .16s ease, box-shadow .16s ease; }
      .nr-verify-clickable:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(245, 158, 11, .18); }
      .nr-verify-modal-backdrop {
        position: fixed; inset: 0; z-index: 99999; background: rgba(17, 24, 39, .42);
        display: flex; align-items: center; justify-content: center; padding: 20px;
      }
      .nr-verify-modal {
        width: min(520px, 100%); background: #fff; border-radius: 16px; padding: 22px;
        box-shadow: 0 24px 70px rgba(17,24,39,.24); border: 1px solid #e5e7eb;
        font-family: inherit;
      }
      .nr-verify-modal h3 { margin: 0 0 8px; color: var(--primary, #111827); font-size: 20px; }
      .nr-verify-modal p { margin: 0 0 16px; color: var(--text-light, #6b7280); line-height: 1.55; font-size: 14px; }
      .nr-verify-modal-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
      .nr-verify-modal-actions button {
        border: 0; border-radius: 10px; padding: 12px 14px; font-weight: 800; cursor: pointer;
      }
      .nr-verify-primary { background: var(--primary, #111827); color: #fff; }
      .nr-verify-secondary { background: #f3f4f6; color: var(--primary, #111827); border: 1px solid #e5e7eb !important; }
      .nr-test-pill {
        position: absolute; top: 12px; left: 12px; z-index: 2; background: #2563eb; color: #fff;
        border-radius: 999px; padding: 5px 10px; font-size: 11px; font-weight: 900; letter-spacing: .03em;
      }
      .nr-attr-bar { width: 100%; height: 7px; background: #e2e8f0; border-radius: 999px; position: relative; overflow: visible; }
      .nr-attr-notch { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 24px; height: 9px; background: #000; border-radius: 2px; }
      .review-card { position: relative; }
    `;
    document.head.appendChild(style);
  }

  function ensureSpamFilter() {
    const filter = document.getElementById('status-filter');
    if (!filter || Array.from(filter.options).some((option) => option.value === 'spam')) return;
    const option = document.createElement('option');
    option.value = 'spam';
    option.textContent = 'Spam / Test';
    filter.appendChild(option);
  }

  function getReviewManagerButton() {
    return document.querySelector('button[onclick="window.tab(\'v-mgr\')"], button[onclick="tab(\'v-mgr\')"], button[onclick*="v-mgr"]');
  }

  function ensureBell() {
    const btn = getReviewManagerButton();
    if (!btn) return null;

    let bell = btn.querySelector('.nr-review-bell');
    if (!bell) {
      bell = document.createElement('span');
      bell.className = 'nr-review-bell is-hidden';
      bell.setAttribute('data-count', '0');
      bell.innerHTML = '🔔 <b>0</b>';
      btn.appendChild(bell);
    }
    return bell;
  }

  function updateBell(count) {
    const bell = ensureBell();
    if (!bell) return;
    pendingReviewCount = count;
    bell.setAttribute('data-count', String(count));
    bell.classList.toggle('is-hidden', count <= 0);
    const number = bell.querySelector('b');
    if (number) number.textContent = String(count);
  }

  async function fetchReviewsSnapshot() {
    const res = await fetch(`${API_BASE}/admin/reviews?shopDomain=${encodeURIComponent(SHOP)}&t=${Date.now()}`);
    if (!res.ok) return [];
    return res.json();
  }

  function maxCreatedAt(reviews) {
    return reviews.reduce((latest, review) => {
      const time = review.createdAt ? new Date(review.createdAt).getTime() : 0;
      return time > latest ? time : latest;
    }, 0);
  }

  async function initialiseBellBaseline() {
    try {
      const reviews = await fetchReviewsSnapshot();
      const max = maxCreatedAt(reviews);
      latestSeenCreatedAt = max ? new Date(max).toISOString() : new Date().toISOString();
      updateBell(0);
    } catch (error) {
      console.warn('[Nectar Reviews] Could not initialise review notification baseline.', error);
    }
  }

  async function pollReviewChanges() {
    if (!latestSeenCreatedAt) return;
    try {
      const res = await fetch(`${API_BASE}/admin/reviews/changes?shopDomain=${encodeURIComponent(SHOP)}&since=${encodeURIComponent(latestSeenCreatedAt)}&t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      updateBell(Number(data.count || 0));
    } catch (error) {
      console.warn('[Nectar Reviews] Could not check review changes.', error);
    }
  }

  async function refreshReviewManager() {
    if (typeof window.load === 'function') {
      await window.load();
    }
    await initialiseBellBaseline();
  }

  function wrapTab() {
    if (window.__nrReviewManagerTabWrapped || typeof window.tab !== 'function') return;
    const originalTab = window.tab;
    window.tab = function (id) {
      const result = originalTab.apply(this, arguments);
      if (id === 'v-mgr') {
        refreshReviewManager();
      }
      return result;
    };
    window.__nrReviewManagerTabWrapped = true;
  }

  function attributesHtml(r) {
    const attributes = asAttributeObject(r.attributes);
    const keys = Object.keys(attributes || {});
    if (!keys.length) return '';

    return `
      <div style="margin-top:15px; border-top:1px dashed var(--border); padding-top:15px; display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:15px;">
        ${keys.map((key) => {
          const val = Number(attributes[key] || 0);
          const pct = Math.max(0, Math.min(100, (val / 10) * 100));
          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:800; color:var(--text-light); text-transform:uppercase; margin-bottom:6px;">
                <span>${escapeHtml(key)}</span><span>${escapeHtml(val)}/10</span>
              </div>
              <div class="nr-attr-bar"><span class="nr-attr-notch" style="left:${pct}%;"></span></div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function verificationHtml(r) {
    if (r.verifiedPurchase) {
      return `<div class="v-badge v-badge-yes" title="${escapeHtml(r.verificationNote || 'Verified Purchase')}">✓ Verified Buyer</div>`;
    }
    return `
      <button type="button" class="v-badge v-badge-no nr-verify-clickable" data-review-verify="${escapeHtml(r._id)}" title="${escapeHtml(r.verificationNote || 'Click to verify manually')}">
        ⚠️ Unverified
      </button>
    `;
  }

  function overrideBuildCard() {
    window.buildCard = function (r, isTrash) {
      const customerBox = r.email
        ? `<a href="https://${SHOP}/admin/customers?query=${encodeURIComponent(r.email)}" target="_blank" class="customer-link" title="Open Customer Profile">${escapeHtml(r.userId || 'Guest')}</a>`
        : `<strong style="font-size:1.1rem;">${escapeHtml(r.userId || 'Guest')}</strong>`;

      const testPill = r.isTestReview ? `<div class="nr-test-pill">TEST REVIEW</div>` : '';
      const attrHtml = attributesHtml(r);
      const verifyHtml = verificationHtml(r);

      return `
        <div class="review-card status-border-${escapeHtml(r.status)}" data-review-id="${escapeHtml(r._id)}" style="position:relative;">
          ${testPill}
          <div style="display:flex; justify-content:space-between; gap:40px; width:100%;">
            <div class="card-main" style="flex:1; padding-top:${r.isTestReview ? '22px' : '0'};">
              <div style="display:flex; justify-content:space-between; margin-bottom:15px; gap:16px; align-items:flex-start;">
                <div>${customerBox}</div>
                <div class="status-group">
                  <button onclick="window.updateStatus('${escapeHtml(r._id)}', 'accepted')" class="s-btn acc ${r.status === 'accepted' ? 'active' : ''}" title="Accept">✓</button>
                  <button onclick="window.updateStatus('${escapeHtml(r._id)}', 'hold')" class="s-btn hld ${r.status === 'hold' ? 'active' : ''}" title="Hold">⏸</button>
                  <button onclick="window.updateStatus('${escapeHtml(r._id)}', 'rejected')" class="s-btn rej ${r.status === 'rejected' ? 'active' : ''}" title="Reject">✕</button>
                </div>
              </div>

              <div style="color:var(--star); margin-bottom:10px; font-size:18px;">${'★'.repeat(Number(r.rating || 0))}${'☆'.repeat(5 - Number(r.rating || 0))}</div>
              <div style="font-weight:800; margin-bottom:8px; font-size:18px;">${escapeHtml(r.headline || 'No Headline')}</div>
              <div style="color:#444; line-height:1.6; font-size:15px;">${escapeHtml(r.comment || '')}</div>
              ${attrHtml}
            </div>

            <div class="card-side" style="min-width:240px; text-align:right; border-left:1px solid var(--border); padding-left:30px; display:flex; flex-direction:column; justify-content:space-between; align-items:flex-end;">
              <div style="display:flex; flex-direction:column; align-items:flex-end; gap:7px;">
                <div style="font-size:12px; color:var(--text-light);">Product ID:</div>
                <a href="https://${SHOP}/admin/products/${encodeURIComponent(r.itemId)}" target="_blank" style="color:var(--blue); font-weight:800; text-decoration:none; padding:4px 8px; background:#e0f2fe; border-radius:6px; display:inline-block;">
                  ${escapeHtml(r.itemId)} ↗
                </a>
                <div style="font-size:12px; color:var(--text-light);">${new Date(r.createdAt).toLocaleDateString()}</div>
                <div style="font-size:13px; color:var(--primary); font-weight:700; word-break:break-word; max-width:220px;">${escapeHtml(r.email || 'No Email')}</div>
                ${verifyHtml}
              </div>
              <div style="padding-top:20px;">
                ${isTrash ? `<button class="restore-btn" onclick="window.toggleBin('${escapeHtml(r._id)}', false)">↺ Restore</button>` : `<button class="delete-btn" onclick="window.toggleBin('${escapeHtml(r._id)}', true)">🗑️ Trash</button>`}
              </div>
            </div>
          </div>

          <div style="width:100%; margin-top:15px; border-top:1px dashed var(--border); padding-top:15px;">
            <button class="reply-toggle" style="margin-top:0;" onclick="window.toggleReplyBox('${escapeHtml(r._id)}')">💬 Reply to Customer</button>
            <div id="reply-box-${escapeHtml(r._id)}" class="reply-panel" style="display:${r.reply ? 'block' : 'none'}; margin-top:15px;">
              <textarea id="reply-text-${escapeHtml(r._id)}" class="reply-input" placeholder="Type your public reply..." style="max-width:100%;">${escapeHtml(r.reply || '')}</textarea>
              <div style="text-align:right;">
                <button id="reply-btn-${escapeHtml(r._id)}" class="post-btn" onclick="window.saveReply('${escapeHtml(r._id)}')">Publish Reply</button>
              </div>
            </div>
          </div>
        </div>
      `;
    };
  }

  function openVerifyModal(reviewId) {
    closeVerifyModal();
    const modal = document.createElement('div');
    modal.className = 'nr-verify-modal-backdrop';
    modal.id = 'nr-verify-modal-backdrop';
    modal.innerHTML = `
      <div class="nr-verify-modal" role="dialog" aria-modal="true" aria-labelledby="nr-verify-title">
        <h3 id="nr-verify-title">Mark this review as verified?</h3>
        <p>You can manually verify this review, or ask the system to re-check Shopify using the review email, order number if present, and product ID.</p>
        <div class="nr-verify-modal-actions">
          <button class="nr-verify-secondary" type="button" data-nr-verify-action="recheck" data-review-id="${escapeHtml(reviewId)}">Re-check Shopify</button>
          <button class="nr-verify-primary" type="button" data-nr-verify-action="manual" data-review-id="${escapeHtml(reviewId)}">Mark verified</button>
        </div>
        <div class="nr-verify-modal-actions" style="grid-template-columns:1fr; margin-top:10px;">
          <button class="nr-verify-secondary" type="button" data-nr-verify-action="cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function closeVerifyModal() {
    const existing = document.getElementById('nr-verify-modal-backdrop');
    if (existing) existing.remove();
  }

  async function verifyReview(reviewId, mode) {
    try {
      const res = await fetch(`${API_BASE}/admin/reviews/${encodeURIComponent(reviewId)}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (!res.ok) throw new Error('Verification failed');
      closeVerifyModal();
      showToast(mode === 'recheck' ? 'Shopify verification re-checked.' : 'Review marked verified.');
      await refreshReviewManager();
    } catch (error) {
      alert('Could not verify this review. Please try again.');
    }
  }

  function showToast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log(message);
  }

  function bindDocumentEvents() {
    document.addEventListener('click', (event) => {
      const verifyButton = event.target.closest('[data-review-verify]');
      if (verifyButton) {
        event.preventDefault();
        openVerifyModal(verifyButton.getAttribute('data-review-verify'));
        return;
      }

      const modalAction = event.target.closest('[data-nr-verify-action]');
      if (!modalAction) return;

      const action = modalAction.getAttribute('data-nr-verify-action');
      if (action === 'cancel') closeVerifyModal();
      if (action === 'manual' || action === 'recheck') verifyReview(modalAction.getAttribute('data-review-id'), action);
    });
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollReviewChanges, 20000);
  }

  function init() {
    ensureStyles();
    ensureSpamFilter();
    ensureBell();
    overrideBuildCard();
    wrapTab();
    bindDocumentEvents();
    initialiseBellBaseline();
    startPolling();
    if (typeof window.renderLists === 'function') window.renderLists();
    console.log('[Nectar Reviews] Review manager enhancements loaded.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
