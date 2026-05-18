const fs = require('fs');
const path = require('path');

const root = process.cwd();
const htmlPath = path.join(root, 'admin.html');
const jsPath = path.join(root, 'admin.js');
const serverPath = path.join(root, 'server.js');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.copyFileSync(file, `${file}.bak-${Date.now()}`);
  fs.writeFileSync(file, content);
}

let html = read(htmlPath);
let adminJs = read(jsPath);

const manualRewardCss = `
/* Manual reward issue button */
.nr-reward-btn {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text);
  border-radius: 10px;
  padding: 8px 10px;
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
  margin-left: 6px;
}

.nr-reward-btn:hover {
  background: var(--text);
  color: #fff;
  border-color: var(--text);
}

.nr-reward-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
`;

if (!html.includes('Manual reward issue button')) {
  html = html.replace('</style>', `${manualRewardCss}\n</style>`);
  write(htmlPath, html);
}

const manualRewardJs = `

/* -------------------------------------------------------------------------- */
/* Manual reward issue button */
/* -------------------------------------------------------------------------- */

(function () {
  if (window.__nectarManualRewardButtonLoaded) return;
  window.__nectarManualRewardButtonLoaded = true;

  function toast(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
    } else {
      alert(message);
    }
  }

  function apiBase() {
    return typeof API !== 'undefined' && API ? API : '/api';
  }

  function shopDomain() {
    if (typeof SHOP_DOMAIN !== 'undefined' && SHOP_DOMAIN) return SHOP_DOMAIN;

    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('shopDomain') || url.searchParams.get('shop') || '';
    } catch (error) {
      return '';
    }
  }

  function humanReason(reason) {
    return String(reason || 'unknown')
      .replace(/_/g, ' ')
      .replace(/\\b\\w/g, letter => letter.toUpperCase());
  }

  function extractReviewId(button) {
    const containerId = button.closest('[data-review-id]')?.getAttribute('data-review-id');
    if (containerId) return containerId;

    const onclick = button.getAttribute('onclick') || '';
    const match = onclick.match(/updateStatus\\s*\\(\\s*['"]([^'"]+)['"]/);
    return match ? match[1] : '';
  }

  function getReviewContainer(button) {
    return (
      button.closest('tr') ||
      button.closest('.review-card') ||
      button.closest('.review-item') ||
      button.closest('.panel') ||
      button.parentElement
    );
  }

  window.issueReviewReward = async function(reviewId, button) {
    if (!reviewId) {
      toast('Could not find review ID for this row.');
      return;
    }

    const originalText = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Issuing...';
    }

    try {
      const res = await fetch(apiBase() + '/reviews/' + encodeURIComponent(reviewId) + '/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: shopDomain() })
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || 'Could not issue reward code');
      }

      if (json.created) {
        toast('Reward code issued');
        if (button) button.textContent = 'Reward Issued';
      } else if (json.skipped) {
        toast('Reward skipped: ' + humanReason(json.reason));
        if (button) {
          button.disabled = false;
          button.textContent = originalText || 'Issue Reward';
        }
      } else {
        toast('Reward request completed');
        if (button) {
          button.disabled = false;
          button.textContent = originalText || 'Issue Reward';
        }
      }

      if (typeof window.loadRewardCodes === 'function') window.loadRewardCodes();
      if (typeof window.loadDashboardOverview === 'function') window.loadDashboardOverview();
    } catch (error) {
      console.warn('Manual reward issue failed:', error);
      toast(error.message || 'Could not issue reward code');

      if (button) {
        button.disabled = false;
        button.textContent = originalText || 'Issue Reward';
      }
    }
  };

  window.injectRewardButtons = function() {
    const statusButtons = Array.from(document.querySelectorAll('[onclick*="updateStatus"]'));

    const seen = new Set();

    statusButtons.forEach(statusButton => {
      const reviewId = extractReviewId(statusButton);
      if (!reviewId || seen.has(reviewId)) return;
      seen.add(reviewId);

      const container = getReviewContainer(statusButton);
      if (!container) return;

      if (container.querySelector('[data-reward-for="' + reviewId + '"]')) return;

      const rewardButton = document.createElement('button');
      rewardButton.type = 'button';
      rewardButton.className = 'nr-reward-btn';
      rewardButton.textContent = 'Issue Reward';
      rewardButton.setAttribute('data-reward-for', reviewId);

      rewardButton.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        window.issueReviewReward(reviewId, rewardButton);
      });

      const actionArea = statusButton.parentElement || container;
      actionArea.appendChild(rewardButton);
    });
  };

  let injectTimer = null;

  function scheduleInject() {
    clearTimeout(injectTimer);
    injectTimer = setTimeout(() => {
      if (typeof window.injectRewardButtons === 'function') {
        window.injectRewardButtons();
      }
    }, 150);
  }

  const observer = new MutationObserver(scheduleInject);

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', scheduleInject);
  setTimeout(scheduleInject, 500);
  setTimeout(scheduleInject, 1500);
  setInterval(scheduleInject, 3000);
})();
`;

if (!adminJs.includes('Manual reward issue button')) {
  adminJs += manualRewardJs;
  write(jsPath, adminJs);
}

if (fs.existsSync(serverPath)) {
  const server = read(serverPath);
  if (!server.includes("/api/reviews/:id/reward")) {
    console.warn("");
    console.warn("WARNING: server.js does not appear to contain POST /api/reviews/:id/reward.");
    console.warn("The button has been added, but it needs the reward endpoint from the discount patch to work.");
    console.warn("");
  }
}

console.log('Done. Added manual Issue Reward button to Review Manager.');
