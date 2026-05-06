/*
  Nectar Reviews — public score notch helper
  Adds black notch markers to visible customer-consensus / attribute bars when a review display template only renders a grey track and a "8/10" style value.

  Safe to include after review widgets. It does not change data, only presentation.
*/
(function () {
  'use strict';

  function findTrackNearValue(valueEl) {
    const row = valueEl.closest('.rev-attribute, .review-attribute, .attribute-row, .nr-attribute, .nectar-attribute, div');
    if (!row) return null;

    const candidates = Array.from(row.querySelectorAll('div, span')).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor || '';
      return rect.width > 60 && rect.height > 2 && rect.height <= 12 && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    });

    return candidates.find((el) => !el.classList.contains('nr-score-notch')) || null;
  }

  function addNotch(track, score) {
    if (!track || track.dataset.nrNotched === 'true') return;

    track.dataset.nrNotched = 'true';
    track.style.position = track.style.position || 'relative';
    track.style.overflow = 'visible';

    const notch = document.createElement('span');
    notch.className = 'nr-score-notch';
    notch.style.position = 'absolute';
    notch.style.left = `${Math.max(0, Math.min(100, score * 10))}%`;
    notch.style.top = '50%';
    notch.style.width = '24px';
    notch.style.height = '10px';
    notch.style.borderRadius = '3px';
    notch.style.background = '#000';
    notch.style.transform = 'translate(-50%, -50%)';
    notch.style.boxShadow = '0 1px 2px rgba(0,0,0,0.22)';
    notch.style.pointerEvents = 'none';

    track.appendChild(notch);
  }

  function scan() {
    const textNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (/\b(10|[0-9](?:\.\d+)?)\s*\/\s*10\b/.test(node.nodeValue || '')) textNodes.push(node);
    }

    textNodes.forEach((node) => {
      const match = String(node.nodeValue || '').match(/\b(10|[0-9](?:\.\d+)?)\s*\/\s*10\b/);
      if (!match) return;

      const valueEl = node.parentElement;
      const track = findTrackNearValue(valueEl);
      if (track) addNotch(track, parseFloat(match[1]));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(scan, 250));
  } else {
    setTimeout(scan, 250);
  }

  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 250);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
