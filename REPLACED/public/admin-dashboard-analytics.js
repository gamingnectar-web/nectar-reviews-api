/*
  Nectar Reviews — Dashboard Analytics Enhancer
  File: public/admin-dashboard-analytics.js

  Load after admin.js:
  <script src="/admin-dashboard-analytics.js?v=1"></script>
*/
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const SHOP = window.SHOP_DOMAIN || params.get('shop') || 'your-dev-store.myshopify.com';
  let lastLoadedAt = 0;

  function injectStyles() {
    if (document.getElementById('nr-dashboard-analytics-style')) return;

    const style = document.createElement('style');
    style.id = 'nr-dashboard-analytics-style';
    style.textContent = `
      .nr-analytics-shell {
        margin-top: 24px;
        display: grid;
        gap: 20px;
      }

      .nr-analytics-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
      }

      .nr-analytics-card {
        background: #ffffff;
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 16px;
        padding: 18px;
        box-shadow: 0 1px 3px rgba(17, 24, 39, 0.06);
      }

      .nr-analytics-card span {
        display: block;
        margin-bottom: 8px;
        color: var(--text-light, #6b7280);
        font-size: 11px;
        font-weight: 850;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .nr-analytics-card strong {
        display: block;
        color: var(--primary, #111827);
        font-size: 30px;
        line-height: 1;
        letter-spacing: -0.04em;
      }

      .nr-analytics-card small {
        display: block;
        margin-top: 10px;
        color: var(--text-light, #6b7280);
        font-size: 12px;
        line-height: 1.4;
      }

      .nr-analytics-panel {
        background: #ffffff;
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 16px;
        box-shadow: 0 1px 3px rgba(17, 24, 39, 0.06);
        overflow: hidden;
      }

      .nr-analytics-panel-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding: 18px;
        border-bottom: 1px solid var(--border, #e5e7eb);
      }

      .nr-analytics-panel-head h3 {
        margin: 0;
        color: var(--primary, #111827);
        font-size: 18px;
      }

      .nr-analytics-panel-head p {
        margin: 4px 0 0;
        color: var(--text-light, #6b7280);
        font-size: 13px;
        line-height: 1.5;
      }

      .nr-analytics-panel-body {
        padding: 18px;
      }

      .nr-analytics-two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }

      .nr-bar-list {
        display: grid;
        gap: 12px;
      }

      .nr-bar-row {
        display: grid;
        grid-template-columns: 64px minmax(0, 1fr) 44px;
        gap: 12px;
        align-items: center;
        font-size: 13px;
        color: var(--primary, #111827);
      }

      .nr-bar-track {
        height: 8px;
        background: #e5e7eb;
        border-radius: 999px;
        overflow: hidden;
      }

      .nr-bar-fill {
        height: 100%;
        min-width: 0;
        background: var(--primary, #111827);
        border-radius: 999px;
      }

      .nr-spark-bars {
        height: 130px;
        display: flex;
        align-items: flex-end;
        gap: 4px;
        padding-top: 12px;
      }

      .nr-spark-bar {
        flex: 1;
        min-width: 4px;
        background: #111827;
        border-radius: 6px 6px 0 0;
        opacity: 0.85;
      }

      .nr-analytics-note {
        margin-top: 12px;
        padding: 12px;
        border: 1px solid #bfdbfe;
        background: #eff6ff;
        border-radius: 12px;
        color: #1e40af;
        font-size: 13px;
        line-height: 1.5;
      }

      .nr-dashboard-refresh {
        border: 0;
        border-radius: 10px;
        background: var(--primary, #111827);
        color: #fff;
        padding: 10px 14px;
        font-weight: 800;
        cursor: pointer;
      }

      @media (max-width: 1100px) {
        .nr-analytics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .nr-analytics-two { grid-template-columns: 1fr; }
      }

      @media (max-width: 640px) {
        .nr-analytics-grid { grid-template-columns: 1fr; }
        .nr-analytics-panel-head { flex-direction: column; align-items: stretch; }
        .nr-dashboard-refresh { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function findDashboard() {
    return document.getElementById('v-dash') || document.querySelector('.view.active') || document.querySelector('main') || document.body;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function pct(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function maxCount(series) {
    return Math.max(1, ...series.map((item) => Number(item.count || 0)));
  }

  function sparkBars(series) {
    const max = maxCount(series);
    return `<div class="nr-spark-bars">${series.map((item) => {
      const h = Math.max(3, Math.round((Number(item.count || 0) / max) * 100));
      const label = item.date || item.month || '';
      return `<div class="nr-spark-bar" title="${label}: ${item.count}" style="height:${h}%"></div>`;
    }).join('')}</div>`;
  }

  function ratingBars(distribution) {
    const total = Object.values(distribution || {}).reduce((acc, val) => acc + Number(val || 0), 0) || 1;
    return `<div class="nr-bar-list">${[5, 4, 3, 2, 1].map((star) => {
      const count = Number(distribution && distribution[star] ? distribution[star] : 0);
      const width = Math.round((count / total) * 100);
      return `
        <div class="nr-bar-row">
          <strong>${star} ★</strong>
          <div class="nr-bar-track"><div class="nr-bar-fill" style="width:${width}%"></div></div>
          <span>${count}</span>
        </div>`;
    }).join('')}</div>`;
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} failed`);
    return res.json();
  }

  async function loadAnalytics() {
    try {
      return await fetchJson(`/api/admin/campaign-analytics?shopDomain=${encodeURIComponent(SHOP)}&t=${Date.now()}`);
    } catch (error) {
      console.warn('[Nectar Reviews] Detailed analytics endpoint unavailable. Falling back to current admin data.', error);
      const [stats, reviews] = await Promise.all([
        fetchJson(`/api/admin/stats?shopDomain=${encodeURIComponent(SHOP)}&t=${Date.now()}`),
        fetchJson(`/api/admin/reviews?shopDomain=${encodeURIComponent(SHOP)}&t=${Date.now()}`)
      ]);

      const live = reviews.filter((r) => r.status === 'accepted' && !r.isDeleted && !r.isTestReview);
      const emailReviews = reviews.filter((r) => r.source === 'email' && !r.isDeleted && !r.isTestReview);
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      live.forEach((review) => { distribution[review.rating] = (distribution[review.rating] || 0) + 1; });

      const daily = buildClientDaily(reviews.filter((r) => !r.isDeleted && !r.isTestReview), 30);
      const monthly = buildClientMonthly(reviews.filter((r) => !r.isDeleted && !r.isTestReview), 12);
      const avg = live.length ? live.reduce((sum, r) => sum + Number(r.rating || 0), 0) / live.length : 0;
      const sent = stats.emailStats?.sent || 0;

      return {
        summary: {
          totalReviews: reviews.filter((r) => !r.isDeleted && !r.isTestReview).length,
          liveReviews: live.length,
          pendingReviews: reviews.filter((r) => r.status === 'pending' && !r.isDeleted && !r.isTestReview).length,
          averageRating: Number(avg.toFixed(2)),
          reviewsThisWeek: daily.slice(-7).reduce((sum, item) => sum + item.count, 0),
          reviewsThisMonth: daily.reduce((sum, item) => sum + item.count, 0)
        },
        email: {
          sent,
          opened: 0,
          clicked: 0,
          reviews: emailReviews.length,
          liveReviews: emailReviews.filter((r) => r.status === 'accepted').length,
          openRate: 0,
          clickRate: 0,
          reviewRate: sent ? Number(((emailReviews.length / sent) * 100).toFixed(1)) : 0,
          note: 'Open and click tracking will appear after the campaign tracking server update is deployed and the email template includes tracking links.'
        },
        ratings: { average: Number(avg.toFixed(2)), distribution },
        time: { dailyReviews: daily, monthlyReviews: monthly, dailyEmailReviews: [], monthlyEmailReviews: [], dailyOpens: [], dailyClicks: [] }
      };
    }
  }

  function buildClientDaily(reviews, days) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const map = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    reviews.forEach((review) => {
      const key = new Date(review.createdAt).toISOString().slice(0, 10);
      if (map.has(key)) map.set(key, map.get(key) + 1);
    });
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }

  function buildClientMonthly(reviews, months) {
    const now = new Date();
    const map = new Map();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
      map.set(d.toISOString().slice(0, 7), 0);
    }
    reviews.forEach((review) => {
      const key = new Date(review.createdAt).toISOString().slice(0, 7);
      if (map.has(key)) map.set(key, map.get(key) + 1);
    });
    return Array.from(map.entries()).map(([month, count]) => ({ month, count }));
  }

  function render(analytics) {
    const dash = findDashboard();
    if (!dash) return;

    let shell = document.getElementById('nr-dashboard-analytics');
    if (!shell) {
      shell = document.createElement('section');
      shell.id = 'nr-dashboard-analytics';
      shell.className = 'nr-analytics-shell';
      dash.appendChild(shell);
    }

    shell.innerHTML = `
      <div class="nr-analytics-panel">
        <div class="nr-analytics-panel-head">
          <div>
            <h3>Campaign & Review Snapshot</h3>
            <p>Campaign context, review velocity, score health, and email engagement.</p>
          </div>
          <button class="nr-dashboard-refresh" type="button" id="nr-refresh-dashboard-analytics">Refresh analytics</button>
        </div>
        <div class="nr-analytics-panel-body">
          <div class="nr-analytics-grid">
            <div class="nr-analytics-card"><span>Emails sent</span><strong>${formatNumber(analytics.email.sent)}</strong><small>${analytics.email.note || 'Tracked from Flow and email events.'}</small></div>
            <div class="nr-analytics-card"><span>Email opens</span><strong>${formatNumber(analytics.email.opened)}</strong><small>${pct(analytics.email.openRate)} open rate</small></div>
            <div class="nr-analytics-card"><span>Email clicks</span><strong>${formatNumber(analytics.email.clicked)}</strong><small>${pct(analytics.email.clickRate)} click rate</small></div>
            <div class="nr-analytics-card"><span>Email reviews</span><strong>${formatNumber(analytics.email.reviews)}</strong><small>${pct(analytics.email.reviewRate)} review conversion</small></div>
            <div class="nr-analytics-card"><span>Average score</span><strong>${Number(analytics.summary.averageRating || 0).toFixed(1)}</strong><small>Based on live accepted reviews</small></div>
            <div class="nr-analytics-card"><span>Total reviews</span><strong>${formatNumber(analytics.summary.totalReviews)}</strong><small>${formatNumber(analytics.summary.liveReviews)} live on store</small></div>
            <div class="nr-analytics-card"><span>This week</span><strong>${formatNumber(analytics.summary.reviewsThisWeek)}</strong><small>New review submissions</small></div>
            <div class="nr-analytics-card"><span>This month</span><strong>${formatNumber(analytics.summary.reviewsThisMonth)}</strong><small>New review submissions</small></div>
          </div>
          <div class="nr-analytics-note">
            Accurate sent counts require a Shopify Flow <strong>Send HTTP request</strong> step before the email. Opens require the generated email to include the tracking pixel. Clicks require tracked review links.
          </div>
        </div>
      </div>

      <div class="nr-analytics-two">
        <div class="nr-analytics-panel">
          <div class="nr-analytics-panel-head"><div><h3>Reviews per day</h3><p>Last 30 days.</p></div></div>
          <div class="nr-analytics-panel-body">${sparkBars(analytics.time.dailyReviews || [])}</div>
        </div>
        <div class="nr-analytics-panel">
          <div class="nr-analytics-panel-head"><div><h3>Reviews per month</h3><p>Last 12 months.</p></div></div>
          <div class="nr-analytics-panel-body">${sparkBars(analytics.time.monthlyReviews || [])}</div>
        </div>
      </div>

      <div class="nr-analytics-two">
        <div class="nr-analytics-panel">
          <div class="nr-analytics-panel-head"><div><h3>Score distribution</h3><p>Accepted, non-test reviews.</p></div></div>
          <div class="nr-analytics-panel-body">${ratingBars(analytics.ratings.distribution || {})}</div>
        </div>
        <div class="nr-analytics-panel">
          <div class="nr-analytics-panel-head"><div><h3>Email engagement trend</h3><p>Daily opens from tracked emails.</p></div></div>
          <div class="nr-analytics-panel-body">${sparkBars(analytics.time.dailyOpens && analytics.time.dailyOpens.length ? analytics.time.dailyOpens : [{ date: 'No tracked opens yet', count: 0 }])}</div>
        </div>
      </div>
    `;

    const btn = document.getElementById('nr-refresh-dashboard-analytics');
    if (btn) btn.addEventListener('click', refreshAnalytics);
  }

  async function refreshAnalytics() {
    injectStyles();
    const analytics = await loadAnalytics();
    render(analytics);
    lastLoadedAt = Date.now();
  }

  function hookDashboardTab() {
    const oldTab = window.tab;
    if (typeof oldTab === 'function' && !oldTab.__nrDashboardAnalyticsHooked) {
      const hooked = function (id) {
        const result = oldTab.apply(this, arguments);
        if (id === 'v-dash') setTimeout(refreshAnalytics, 150);
        return result;
      };
      hooked.__nrDashboardAnalyticsHooked = true;
      window.tab = hooked;
    }
  }

  function init() {
    injectStyles();
    hookDashboardTab();

    const dash = findDashboard();
    if (dash && (dash.classList.contains('active') || !document.querySelector('.view.active'))) {
      refreshAnalytics();
    }

    setInterval(() => {
      const activeDash = document.getElementById('v-dash');
      if (activeDash && activeDash.classList.contains('active') && Date.now() - lastLoadedAt > 60000) {
        refreshAnalytics();
      }
    }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
