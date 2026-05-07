/*
  Nectar Reviews — public/admin score notch safety net
  File: public/nectar-score-notch-fix.js

  This is intentionally generic. It adds black score notches to common Nectar attribute bars
  when the bar exposes a score via data-score, aria-valuenow, or nearby /10 text.
*/
(function () {
  'use strict';

  function addStyles() {
    if (document.getElementById('nectar-score-notch-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'nectar-score-notch-fix-style';
    style.textContent = `
      .nectar-score-notch-host { position: relative !important; overflow: visible !important; }
      .nectar-score-notch-host .nectar-score-notch {
        position: absolute; top: 50%; transform: translate(-50%, -50%); width: 24px; height: 9px;
        border-radius: 2px; background: #000; pointer-events: none; z-index: 2;
      }
    `;
    document.head.appendChild(style);
  }

  function parseScore(el) {
    const attrs = ['data-score', 'data-value', 'aria-valuenow'];
    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (val && !Number.isNaN(Number(val))) return Number(val);
    }

    const parentText = (el.parentElement && el.parentElement.textContent) || '';
    const match = parentText.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
    if (match) return Number(match[1]);

    return null;
  }

  function enhanceBar(el) {
    if (!el || el.querySelector('.nectar-score-notch')) return;
    const score = parseScore(el);
    if (score === null) return;
    const pct = Math.max(0, Math.min(100, (score / 10) * 100));
    el.classList.add('nectar-score-notch-host');
    const notch = document.createElement('span');
    notch.className = 'nectar-score-notch';
    notch.style.left = `${pct}%`;
    el.appendChild(notch);
  }

  function scan() {
    addStyles();
    document.querySelectorAll('[data-score], [aria-valuenow], .nr-attr-bar, .attr-bar, .review-attribute-bar, .nectar-attr-bar').forEach(enhanceBar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
