/*
  Nectar Reviews — Review Manager Enhancements
  - Adds blue TEST REVIEW pill.
  - Makes Unverified badge clickable on the right side.
  - Opens a modal to manually mark a review as verified.
  - Keeps attribute bars/notches visible in admin cards.
  - Adds Spam / Test option to the status filter.
*/
(function () {
  'use strict';

  const API_BASE = window.API || 'https://nectar-reviews-api.onrender.com/api';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log(message);
  }

  function injectStyles() {
    if (document.getElementById('nr-review-manager-enhancements-style')) return;

    const style = document.createElement('style');
    style.id = 'nr-review-manager-enhancements-style';
    style.textContent = `
      .review-card.nr-test-review-card {
        position: relative;
        border-color: #60a5fa !important;
        box-shadow: inset 0 0 0 1px #93c5fd, 0 1px 4px rgba(37,99,235,0.08) !important;
      }

      .nr-test-pill {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 999px;
        background: #2563eb;
        color: #ffffff;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        box-shadow: 0 8px 18px rgba(37,99,235,0.22);
      }

      .nr-review-side {
        min-width: 245px;
        text-align: right;
        border-left: 1px solid var(--border, #e5e7eb);
        padding-left: 28px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: space-between;
      }

      .nr-review-badge-stack {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 7px;
      }

      .nr-verify-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 850;
        line-height: 1;
        white-space: nowrap;
      }

      .nr-verify-pill.verified {
        background: #dcfce7;
        border-color: #86efac;
        color: #047857;
      }

      .nr-verify-pill.unverified {
        background: #fef3c7;
        border-color: #fbbf24;
        color: #b45309;
        cursor: pointer;
      }

      .nr-verify-pill.unverified:hover {
        background: #fffbeb;
        border-color: #f59e0b;
        transform: translateY(-1px);
      }

      .nr-verify-helper {
        display: none;
        max-width: 210px;
        color: var(--text-light, #6b7280);
        font-size: 11px;
        line-height: 1.35;
      }

      .nr-review-badge-stack:hover .nr-verify-helper {
        display: block;
      }

      .nr-attribute-grid {
        margin-top: 15px;
        border-top: 1px dashed var(--border, #e5e7eb);
        padding-top: 15px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
      }

      .nr-attribute-label {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 7px;
        color: var(--text-light, #6b7280);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .nr-attribute-track {
        position: relative;
        width: 100%;
        height: 7px;
        border-radius: 999px;
        background: #e5e7eb;
        overflow: visible;
      }

      .nr-attribute-fill {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        border-radius: 999px;
        background: #cbd5e1;
      }

      .nr-attribute-notch {
        position: absolute;
        top: 50%;
        width: 24px;
        height: 10px;
        border-radius: 3px;
        background: #000000;
        transform: translate(-50%, -50%);
        box-shadow: 0 1px 2px rgba(0,0,0,0.2);
      }

      .nr-verify-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(17,24,39,0.45);
      }

      .nr-verify-modal-backdrop.active {
        display: flex;
      }

      .nr-verify-modal {
        width: min(480px, 100%);
        border-radius: 16px;
        background: #ffffff;
        box-shadow: 0 24px 70px rgba(17,24,39,0.22);
        padding: 24px;
      }

      .nr-verify-modal h3 {
        margin: 0 0 8px;
        color: var(--primary, #111827);
        font-size: 20px;
      }

      .nr-verify-modal p {
        margin: 0 0 18px;
        color: var(--text-light, #6b7280);
        font-size: 14px;
        line-height: 1.55;
      }

      .nr-verify-modal-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }

      .nr-verify-modal-actions button {
        border: 0;
        border-radius: 10px;
        padding: 11px 14px;
        font-weight: 850;
        cursor: pointer;
      }

      .nr-verify-cancel {
        background: #f3f4f6;
        color: #111827;
      }

      .nr-verify-confirm {
        background: #059669;
        color: #ffffff;
      }

      @media (max-width: 860px) {
        .nr-review-side {
          width: 100%;
          min-width: 0;
          padding-left: 0;
          border-left: 0;
          border-top: 1px solid var(--border, #e5e7eb);
          padding-top: 18px;
          align-items: flex-start;
          text-align: left;
        }

        .nr-review-badge-stack {
          align-items: flex-start;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById('nr-verify-modal-backdrop')) return;

    const modal = document.createElement('div');
    modal.id = 'nr-verify-modal-backdrop';
    modal.className = 'nr-verify-modal-backdrop';
    modal.innerHTML = `
      <div class="nr-verify-modal" role="dialog" aria-modal="true" aria-labelledby="nr-verify-modal-title">
        <h3 id="nr-verify-modal-title">Mark as verified?</h3>
        <p id="nr-verify-modal-copy">
          This should only be used when you have manually checked that the reviewer bought this product from your store.
        </p>
        <div class="nr-verify-modal-actions">
          <button class="nr-verify-cancel" type="button" data-nr-close-verify>Cancel</button>
          <button class="nr-verify-confirm" type="button" data-nr-confirm-verify>Mark verified</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-nr-close-verify]')) closeVerifyModal();
      if (event.target.closest('[data-nr-confirm-verify]')) confirmVerifyModal();
    });
  }

  let pendingVerifyId = null;

  function openVerifyModal(id, name, productId) {
    pendingVerifyId = id;
    const modal = document.getElementById('nr-verify-modal-backdrop');
    const copy = document.getElementById('nr-verify-modal-copy');
    if (copy) {
      copy.innerHTML = `You are about to manually verify <strong>${escapeHtml(name || 'this review')}</strong>${productId ? ` for product <strong>${escapeHtml(productId)}</strong>` : ''}. This will make the review eligible as a verified purchase.`;
    }
    if (modal) modal.classList.add('active');
  }

  function closeVerifyModal() {
    pendingVerifyId = null;
    const modal = document.getElementById('nr-verify-modal-backdrop');
    if (modal) modal.classList.remove('active');
  }

  async function confirmVerifyModal() {
    if (!pendingVerifyId) return;
    const id = pendingVerifyId;
    closeVerifyModal();

    try {
      const res = await fetch(`${API_BASE}/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifiedPurchase: true, verificationNote: 'Manually verified by admin' })
      });

      if (!res.ok) throw new Error('Could not verify review');

      showToast('Review marked as verified');
      if (typeof window.load === 'function') window.load();
    } catch (error) {
      console.error(error);
      showToast('Could not verify this review');
    }
  }

  function addSpamFilterOption() {
    const statusFilter = document.getElementById('status-filter');
    if (!statusFilter || statusFilter.querySelector('option[value="spam"]')) return;

    const option = document.createElement('option');
    option.value = 'spam';
    option.textContent = 'Spam / Test';
    statusFilter.appendChild(option);
  }

  function buildAttributeBars(attributes) {
    if (!attributes || Object.keys(attributes).length === 0) return '';

    return `
      <div class="nr-attribute-grid">
        ${Object.entries(attributes).map(([key, rawValue]) => {
          const value = Math.max(0, Math.min(10, Number(rawValue) || 0));
          const pct = value * 10;
          return `
            <div class="nr-attribute-item">
              <div class="nr-attribute-label"><span>${escapeHtml(key)}</span><span>${value}/10</span></div>
              <div class="nr-attribute-track">
                <div class="nr-attribute-fill" style="width:${pct}%;"></div>
                <div class="nr-attribute-notch" style="left:${pct}%;"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function buildVerificationBadge(review) {
    if (review.verifiedPurchase) {
      return `
        <div class="nr-review-badge-stack">
          <div class="nr-verify-pill verified" title="${escapeHtml(review.verificationNote || 'Verified Purchase')}">✓ Verified Buyer</div>
        </div>
      `;
    }

    return `
      <div class="nr-review-badge-stack">
        <button type="button" class="nr-verify-pill unverified" onclick="window.openNectarVerifyModal('${escapeHtml(review._id)}', '${escapeHtml(review.userId || 'Guest')}', '${escapeHtml(review.itemId || '')}')" title="${escapeHtml(review.verificationNote || 'Could not verify purchase')}">
          ⚠ Unverified
        </button>
        <div class="nr-verify-helper">Click to manually verify after checking the order/customer in Shopify.</div>
      </div>
    `;
  }

  function installBuildCardOverride() {
    window.buildCard = function(review, isTrash) {
      const status = review.status || 'pending';
      const rating = Math.max(0, Math.min(5, parseInt(review.rating, 10) || 0));
      const date = review.createdAt ? new Date(review.createdAt).toLocaleDateString() : '';
      const testPill = review.isTestReview ? '<div class="nr-test-pill">Test Review</div>' : '';
      const customer = review.email
        ? `<a href="https://${SHOP_DOMAIN}/admin/customers?query=${encodeURIComponent(review.email)}" target="_blank" class="customer-link" title="Open Customer Profile">${escapeHtml(review.userId || 'Guest')}</a>`
        : `<strong style="font-size:1.1rem;">${escapeHtml(review.userId || 'Guest')}</strong>`;

      return `
        <div class="review-card status-border-${escapeHtml(status)} ${review.isTestReview ? 'nr-test-review-card' : ''}">
          ${testPill}
          <div style="display:flex; justify-content:space-between; gap:40px; width:100%;">
            <div class="card-main" style="flex:1; padding-top:${review.isTestReview ? '22px' : '0'};">
              <div style="display:flex; justify-content:space-between; gap:16px; margin-bottom:15px;">
                <div>${customer}</div>
                <div class="status-group">
                  <button onclick="window.updateStatus('${escapeHtml(review._id)}', 'accepted')" class="s-btn acc ${status === 'accepted' ? 'active' : ''}" title="Accept">✓</button>
                  <button onclick="window.updateStatus('${escapeHtml(review._id)}', 'hold')" class="s-btn hld ${status === 'hold' ? 'active' : ''}" title="Hold">⏸</button>
                  <button onclick="window.updateStatus('${escapeHtml(review._id)}', 'rejected')" class="s-btn rej ${status === 'rejected' ? 'active' : ''}" title="Reject">✕</button>
                </div>
              </div>

              <div style="color:var(--star, #ffc700); margin-bottom:10px; font-size:18px;">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</div>
              <div style="font-weight:800; margin-bottom:8px; font-size:18px;">${escapeHtml(review.headline || 'No Headline')}</div>
              <div style="color:#444; line-height:1.6; font-size:15px;">${escapeHtml(review.comment || '')}</div>
              ${buildAttributeBars(review.attributes || {})}
            </div>

            <aside class="nr-review-side">
              <div>
                <div style="font-size:12px; color:var(--text-light, #6b7280); margin-bottom:8px; display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                  <span>Product ID:</span>
                  <a href="https://${SHOP_DOMAIN}/admin/products/${escapeHtml(review.itemId || '')}" target="_blank" style="color:var(--blue, #2563eb); font-weight:800; text-decoration:none; padding:4px 8px; background:#e0f2fe; border-radius:6px; display:inline-block;">
                    ${escapeHtml(review.itemId || 'N/A')} ↗
                  </a>
                </div>
                <div style="font-size:12px; color:var(--text-light, #6b7280); margin-bottom:5px;">${escapeHtml(date)}</div>
                <div style="font-size:13px; color:var(--primary, #111827); font-weight:700; margin-bottom:9px;">${escapeHtml(review.email || 'No Email')}</div>
                ${buildVerificationBadge(review)}
              </div>
              <div style="padding-top:20px;">
                ${isTrash
                  ? `<button class="restore-btn" onclick="window.toggleBin('${escapeHtml(review._id)}', false)">↺ Restore</button>`
                  : `<button class="delete-btn" onclick="window.toggleBin('${escapeHtml(review._id)}', true)">🗑️ Trash</button>`}
              </div>
            </aside>
          </div>

          <div style="width:100%; margin-top:15px; border-top:1px dashed var(--border, #e5e7eb); padding-top:15px;">
            <button class="reply-toggle" style="margin-top:0;" onclick="window.toggleReplyBox('${escapeHtml(review._id)}')">💬 Reply to Customer</button>
            <div id="reply-box-${escapeHtml(review._id)}" class="reply-panel" style="display:${review.reply ? 'block' : 'none'}; margin-top:15px;">
              <textarea id="reply-text-${escapeHtml(review._id)}" class="reply-input" placeholder="Type your public reply..." style="max-width:100%;">${escapeHtml(review.reply || '')}</textarea>
              <div style="text-align:right;">
                <button id="reply-btn-${escapeHtml(review._id)}" class="post-btn" onclick="window.saveReply('${escapeHtml(review._id)}')">Publish Reply</button>
              </div>
            </div>
          </div>
        </div>
      `;
    };
  }

  function init() {
    injectStyles();
    ensureModal();
    addSpamFilterOption();
    window.openNectarVerifyModal = openVerifyModal;
    installBuildCardOverride();

    if (typeof window.renderLists === 'function') window.renderLists();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
