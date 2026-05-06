/*
  Nectar Reviews — Admin test review badge patch
  Load after /admin.js.

  It adds a blue TEST REVIEW pill to review cards whose database document has:
  - isTestReview: true, or
  - testMode: true, or
  - testLabel set

  It does not change dashboard, import, settings, or review publishing behaviour.
*/
(function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('nr-test-review-badge-style')) return;

    const style = document.createElement('style');
    style.id = 'nr-test-review-badge-style';
    style.textContent = `
      .nr-test-review-card {
        position: relative !important;
        border-color: #93c5fd !important;
        box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.18), 0 8px 24px rgba(37, 99, 235, 0.08) !important;
      }

      .nr-test-review-card::before {
        content: 'TEST REVIEW';
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 5;
        display: inline-flex;
        align-items: center;
        height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        background: #2563eb;
        color: #ffffff;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.06em;
        line-height: 1;
        box-shadow: 0 6px 16px rgba(37, 99, 235, 0.24);
      }

      .nr-test-review-card .card-main,
      .nr-test-review-card > div:first-child {
        padding-top: 18px;
      }

      .status-border-spam {
        border-left: 4px solid #2563eb !important;
      }
    `;

    document.head.appendChild(style);
  }

  function isTestReview(review) {
    return Boolean(review && (review.isTestReview || review.testMode || review.testLabel));
  }

  function patchBuildCard() {
    if (typeof window.buildCard !== 'function' || window.buildCard.__nrTestBadgePatched) return false;

    const originalBuildCard = window.buildCard;

    window.buildCard = function patchedBuildCard(review, isTrash) {
      let html = originalBuildCard.call(this, review, isTrash);

      if (isTestReview(review)) {
        html = html.replace(/<div class="review-card([^\"]*)"/, '<div class="review-card$1 nr-test-review-card"');
      }

      return html;
    };

    window.buildCard.__nrTestBadgePatched = true;
    return true;
  }

  function addSpamFilterOption() {
    const filter = document.getElementById('status-filter');
    if (!filter || Array.from(filter.options).some((option) => option.value === 'spam')) return;

    const option = document.createElement('option');
    option.value = 'spam';
    option.textContent = 'Spam / Test';
    filter.appendChild(option);
  }

  function init() {
    injectStyles();
    addSpamFilterOption();

    const patched = patchBuildCard();
    if (patched && typeof window.renderLists === 'function') {
      try { window.renderLists(); } catch (error) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  let attempts = 0;
  const retry = setInterval(() => {
    attempts += 1;
    init();
    if (attempts > 20 || (window.buildCard && window.buildCard.__nrTestBadgePatched)) clearInterval(retry);
  }, 250);
})();
