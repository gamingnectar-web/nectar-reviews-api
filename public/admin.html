<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nectar Reviews Admin</title>
  <meta name="shopify-api-key" content="__SHOPIFY_API_KEY__" />
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
  <style>
    :root {
      --primary: #111827;
      --text: #111827;
      --text-light: #6b7280;
      --border: #e5e7eb;
      --bg: #f4f6f8;
      --card: #ffffff;
      --blue: #005bd3;
      --green: #008060;
      --red: #d72c0d;
      --orange: #b98900;
      --star: #ffc700;
      --shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .app-shell {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      min-height: 100vh;
    }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      padding: 28px 18px;
      background: #f9fafb;
      border-right: 1px solid var(--border);
    }
    .brand { margin: 0 0 28px; }
    .brand h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: -0.04em;
    }
    .brand p {
      margin: 5px 0 0;
      color: var(--text-light);
      font-size: 13px;
      font-weight: 700;
    }
    .nav-group { margin: 0 0 24px; }
    .nav-title {
      margin: 0 0 10px;
      color: #6b7280;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .tab-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      margin: 0 0 5px;
      padding: 10px 12px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #111827;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      text-align: left;
    }
    .tab-btn:hover, .tab-btn.active { background: #ffffff; }
    .tab-btn .pill {
      border-radius: 999px;
      background: #eef2ff;
      color: #4338ca;
      padding: 3px 7px;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .main { padding: 36px; min-width: 0; }
    .view { display: none; }
    .view.active { display: block; }
    .page-title {
      margin: 0 0 24px;
      font-size: 28px;
      letter-spacing: -0.04em;
      line-height: 1.1;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
      margin-bottom: 28px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      margin-bottom: 28px;
    }
    .panel, .stat-card, .review-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      box-shadow: var(--shadow);
    }
    .panel { padding: 28px; }
    .stat-card { padding: 26px; min-height: 126px; }
    .stat-label {
      margin: 0 0 12px;
      color: var(--text-light);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .stat-value {
      margin: 0;
      font-size: 36px;
      line-height: 1;
      letter-spacing: -0.05em;
    }
    .filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 18px;
      align-items: center;
    }
    .search-input, .filter-select, .premium-input, textarea {
      min-height: 44px;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #ffffff;
      color: var(--text);
      font-size: 14px;
      outline: none;
    }
    .search-input:focus, .filter-select:focus, .premium-input:focus, textarea:focus {
      border-color: var(--blue);
      box-shadow: 0 0 0 3px rgba(0,91,211,0.14);
    }
    .search-input { min-width: 260px; flex: 1; }
    .post-btn, .primary-btn {
      min-height: 44px;
      border: 0;
      border-radius: 8px;
      background: var(--primary);
      color: #ffffff;
      padding: 10px 18px;
      font-weight: 800;
      cursor: pointer;
    }
    .secondary-btn {
      min-height: 44px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #ffffff;
      color: var(--text);
      padding: 10px 18px;
      font-weight: 700;
      cursor: pointer;
    }
    .review-card {
      position: relative;
      padding: 24px;
      margin-bottom: 18px;
      overflow: hidden;
    }
    .status-border-accepted { border-color: var(--green); }
    .status-border-hold { border-color: var(--orange); }
    .status-border-rejected { border-color: var(--red); }
    .customer-link { color: var(--text); font-size: 18px; font-weight: 800; text-decoration: none; }
    .status-group { display: inline-flex; gap: 8px; }
    .s-btn {
      width: 38px; height: 38px; border-radius: 999px; border: 2px solid currentColor;
      background: #ffffff; cursor: pointer; font-size: 16px; font-weight: 800;
    }
    .s-btn.acc { color: var(--green); } .s-btn.hld { color: #ea580c; } .s-btn.rej { color: var(--red); }
    .s-btn.active.acc { background: var(--green); color: #ffffff; }
    .s-btn.active.hld { background: #ea580c; color: #ffffff; }
    .s-btn.active.rej { background: var(--red); color: #ffffff; }
    .v-badge { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; padding: 5px 10px; border-radius: 7px; font-size: 12px; font-weight: 800; line-height: 1; white-space: nowrap; }
    .v-badge-yes { background: #dcfce7; color: #047857; border: 1px solid #86efac; }
    .v-badge-no { background: #fef3c7; color: #b45309; border: 1px solid #fbbf24; cursor: pointer; }
    .delete-btn, .restore-btn { border: 1px solid #fecaca; border-radius: 999px; background: #fff1f2; color: var(--red); padding: 9px 14px; font-weight: 800; cursor: pointer; }
    .restore-btn { border-color: #bbf7d0; background: #f0fdf4; color: var(--green); }
    .reply-toggle { border: 0; background: transparent; color: var(--blue); padding: 0; font-weight: 800; cursor: pointer; }
    .reply-input { width: 100%; min-height: 90px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; resize: vertical; }
    .attr-pill { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 14px; border: 1px solid var(--border); border-radius: 10px; background: #f9fafb; margin-top: 10px; }
    .attr-tag { display: inline-flex; padding: 5px 9px; border-radius: 999px; background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 900; text-transform: uppercase; margin-right: 10px; }

    .test-label {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 6px 10px;
      border-radius: 999px;
      background: #2563eb;
      color: #ffffff;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .admin-attr-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(160px, 1fr));
      gap: 16px 28px;
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px dashed var(--border);
    }
    .admin-attr-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 7px;
      color: #6b7280;
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .025em;
    }
    .admin-attr-bar {
      position: relative;
      height: 7px;
      overflow: visible;
      border-radius: 999px;
      background: #e5eaf1;
    }
    .admin-attr-fill {
      display: block;
      height: 100%;
      min-width: 3px;
      max-width: 100%;
      border-radius: 999px;
      background: #111111;
    }
    .admin-attr-fill::after {
      content: '';
      position: absolute;
      top: -1px;
      right: -1px;
      width: 8px;
      height: 9px;
      border-radius: 2px;
      background: #111111;
    }
    .admin-product-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      max-width: 170px;
      margin-top: 6px;
      padding: 7px 10px;
      border-radius: 7px;
      background: #dff1ff;
      color: #005bd3;
      font-size: 13px;
      font-weight: 900;
      text-decoration: none;
      word-break: break-all;
    }
    .admin-card-meta-label {
      margin: 0;
      color: var(--text-light);
      font-size: 12px;
      line-height: 1.35;
    }
    .sub-tabs { display: flex; gap: 8px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
    .sub-tab-btn { border: 0; background: transparent; padding: 14px 18px; color: var(--text-light); font-weight: 800; cursor: pointer; border-bottom: 3px solid transparent; }
    .sub-tab-btn.active { color: var(--blue); border-bottom-color: var(--blue); }
    .sub-view { display: none; } .sub-view.active { display: block; }
    .sub-preview { display: none; } .sub-preview.active { display: block; }
    .preview-card { border: 1px solid var(--border); border-radius: 10px; background: #ffffff; padding: 24px; }
    .import-inst-box { display: none; } .import-inst-box.active { display: block; }
    .valid-green { border-color: var(--green) !important; background: #f0fdf4 !important; }
    .invalid-red { border-color: var(--red) !important; background: #fff1f2 !important; }
    .muted { color: var(--text-light); }
    .lock-box { border: 1px dashed var(--border); border-radius: 12px; padding: 24px; background: #fbfdff; }
    #custom-toast { position: fixed; top: -100px; left: 50%; transform: translateX(-50%); z-index: 99999; background: #111827; color: #ffffff; padding: 12px 16px; border-radius: 999px; font-size: 14px; font-weight: 800; box-shadow: 0 10px 30px rgba(0,0,0,0.18); transition: top 0.25s ease; }
    @media (max-width: 1100px) {
      .app-shell { grid-template-columns: 1fr; }
      .sidebar { position: static; height: auto; }
      .grid-3, .grid-2 { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      .main { padding: 20px; }
      .filter-row { flex-direction: column; align-items: stretch; }
      .search-input { min-width: 0; }
      .review-card > div:first-child { flex-direction: column; }
      .card-side { min-width: 0 !important; text-align: left !important; border-left: 0 !important; border-top: 1px solid var(--border); padding-left: 0 !important; padding-top: 18px; }
      .admin-attr-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div id="custom-toast"></div>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <h1>Nectar Reviews</h1>
        <p>Admin Console</p>
      </div>
      <nav>
        <div class="nav-group">
          <p class="nav-title">Manage</p>
          <button class="tab-btn active" onclick="window.tab('v-dash')">Dashboard</button>
          <button class="tab-btn" onclick="window.tab('v-mgr')">Review Manager</button>
          <button class="tab-btn" onclick="window.tab('v-msg')">Messaging &amp; Campaigns ✉️</button>
          <button class="tab-btn" onclick="window.tab('v-trash')">Trash ️</button>
          <button class="tab-btn" onclick="window.tab('v-import')">Import CSV</button>
        </div>
        <div class="nav-group">
          <p class="nav-title">Configuration</p>
          <button class="tab-btn" onclick="window.tab('v-settings')">Rules &amp; Settings</button>
          <button class="tab-btn" onclick="window.tab('v-style')">Visual Customiser</button>
        </div>
        <div class="nav-group">
          <p class="nav-title">Future Products</p>
          <button class="tab-btn" onclick="window.tab('v-discounts')">Discounts <span class="pill">Soon</span></button>
          <button class="tab-btn" onclick="window.tab('v-loyalty')">Loyalty <span class="pill">Soon</span></button>
          <button class="tab-btn" onclick="window.tab('v-referrals')">Referrals <span class="pill">Soon</span></button>
        </div>
        <div class="nav-group">
          <p class="nav-title">Developers</p>
          <button class="tab-btn" onclick="window.tab('v-manual')">Manual Setup</button>
        </div>
      </nav>
    </aside>

    <main class="main">
      <section id="v-dash" class="view active">
        <h2 class="page-title">Performance Dashboard</h2>
        <div class="grid-3">
          <div class="stat-card"><p class="stat-label">Total Reviews</p><h3 id="stat-total" class="stat-value">0</h3></div>
          <div class="stat-card"><p class="stat-label">Live on Store</p><h3 id="stat-live" class="stat-value">0</h3></div>
          <div id="v-dash-prod-card" class="stat-card"><p class="stat-label">Loading Top Product Snapshot...</p></div>
        </div>
        <div id="nr-dashboard-analytics-mount"></div>
        <div class="grid-2">
          <div class="panel"><h3 style="margin-top:0;">Review Sources</h3><canvas id="chartSources" height="300"></canvas></div>
          <div id="nr-dashboard-secondary-mount" class="panel"><h3 style="margin-top:0;">Security Status</h3><p id="security-status" class="muted">Checking admin session...</p></div>
        </div>
      </section>

      <section id="v-mgr" class="view">
        <h2 class="page-title">Review Manager</h2>
        <div class="filter-row">
          <input id="search-bar" class="search-input" placeholder="Search by reviewer, email or comment..." oninput="window.renderLists()" />
          <select id="star-filter" class="filter-select" onchange="window.renderLists()">
            <option value="all">All Stars</option><option value="5">5 Stars</option><option value="4">4 Stars</option><option value="3">3 Stars</option><option value="2">2 Stars</option><option value="1">1 Star</option>
          </select>
          <select id="status-filter" class="filter-select" onchange="window.renderLists()">
            <option value="all">All Statuses</option><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="hold">On Hold</option><option value="rejected">Rejected</option><option value="spam">Spam / Test</option>
          </select>
          <button class="secondary-btn" onclick="window.load()">Refresh</button>
        </div>
        <div id="mgr-list"><p style="text-align:center; padding:40px; color:#999;">Loading reviews...</p></div>
      </section>

      <section id="v-msg" class="view">
        <h2 class="page-title">Messaging &amp; Campaigns</h2>
        <div id="nr-messaging-campaigns-mount" class="panel"><p style="margin:0; color:var(--text-light);">Loading campaign builder...</p></div>
      </section>

      <section id="v-trash" class="view">
        <h2 class="page-title">Trash Bin</h2>
        <p class="muted">Reviews here will be permanently deleted after 28 days.</p>
        <div id="trash-list"><p>Loading...</p></div>
      </section>

      <section id="v-import" class="view">
        <h2 class="page-title">Importer Tool</h2>
        <div class="panel">
          <h3>1. Export from your old platform</h3>
          <label>Platform</label>
          <select id="import-platform-select" class="filter-select" onchange="window.toggleImportInst()">
            <option value="generic">Generic / Other Format</option><option value="weebly">Weebly / Square</option><option value="judgeme">Judge.me</option>
          </select>
          <div id="inst-generic" class="import-inst-box active"><p>Generic CSV: Ensure your spreadsheet has columns for Product ID, Star Rating, Name, and Review Body.</p></div>
          <div id="inst-weebly" class="import-inst-box"><p>Weebly / Square: Upload the CSV. The next step creates a staging area where you can map products.</p></div>
          <div id="inst-judgeme" class="import-inst-box"><p>Judge.me: Export reviews from Judge.me, then map the columns below.</p></div>
          <hr style="border:0; border-top:1px solid var(--border); margin:24px 0;" />
          <h3>2. Upload and Map Columns</h3>
          <input id="csv-file" type="file" accept=".csv" onchange="window.handleFileUpload()" /> <span id="file-name" class="muted">Select CSV File</span>
          <div id="mapping-ui" style="display:none; margin-top:24px;">
            <h4>Map your columns</h4>
            <div id="column-mappers" class="grid-2"></div>
            <button id="import-submit-btn" class="primary-btn" onclick="window.generateStagingArea()">Preview &amp; Map Products</button>
          </div>
        </div>
      </section>

      <section id="v-settings" class="view">
        <h2 class="page-title">Rules &amp; Settings</h2>
        <div class="grid-2">
          <div class="panel">
            <h3>Developer Beta Mode</h3>
            <p class="muted">Hide the widget from the public while you test on your live theme.</p>
            <label><input id="set-beta-enable" type="checkbox" /> Enable Beta Mode</label>
            <p><input id="set-beta-email" class="premium-input" placeholder="Beta Tester Email" /></p>
            <h3>Google Rich Snippets (SEO)</h3>
            <label><input id="set-seo" type="checkbox" checked /> Enable Rich Snippets</label>
            <h3>Automated Publishing</h3>
            <label><input id="set-auto-enable" type="checkbox" /> Enable Auto-Approve</label>
            <p><select id="set-auto-type" class="filter-select"><option value="verified">Verified Purchases Only</option><option value="all">All Reviews (Inc. Unverified)</option></select></p>
            <p><select id="set-min-stars" class="filter-select"><option value="5">5 Stars only</option><option value="4">4 Stars &amp; up</option><option value="3">3 Stars &amp; up</option><option value="2">2 Stars &amp; up</option><option value="1">All Ratings</option></select></p>
            <button class="primary-btn" onclick="window.saveSettings()">Save Settings</button>
          </div>
          <div class="panel">
            <h3>Smart Conditional Sliders</h3>
            <p><select id="attr-rule-type" class="filter-select" onchange="window.toggleRuleInput()"><option value="tag">Product Tag</option><option value="metafield">Metafield Key</option></select></p>
            <input id="attr-rule-val-tag" class="premium-input" placeholder="Condition e.g. gaming" />
            <select id="attr-rule-val-meta" class="filter-select" style="display:none;"><option value="">Loading Shopify Metafields...</option></select>
            <p><input id="attr-label" class="premium-input" placeholder="Slider label" /></p>
            <button class="secondary-btn" onclick="window.addAttribute()">+ Create Rule</button>
            <div id="attributes-list"></div>
          </div>
        </div>
      </section>

      <section id="v-style" class="view">
        <h2 class="page-title">Visual Customiser</h2>
        <div class="grid-2">
          <div class="panel">
            <div class="sub-tabs">
              <button class="sub-tab-btn active" onclick="window.subTab('style-widget','preview-widget')">Product Widget</button>
              <button class="sub-tab-btn" onclick="window.subTab('style-card','preview-card')">Product Card Stars</button>
              <button class="sub-tab-btn" onclick="window.subTab('style-carousel','preview-carousel')">Global Carousel</button>
            </div>
            <div id="style-widget" class="sub-view active">
              <p><input id="style-title" class="premium-input" placeholder="Widget Title" value="Customer Reviews" oninput="window.updatePreviews()" /></p>
              <p><label>Brand Color</label><br><input id="style-primary" type="color" value="#000000" oninput="window.updatePreviews()" /></p>
              <p><label>Star Color</label><br><input id="style-star" type="color" value="#ffc700" oninput="window.updatePreviews()" /></p>
              <p><label>Text Size (px)</label><br><input id="style-text" class="premium-input" type="number" value="15" oninput="window.updatePreviews()" /></p>
              <button class="primary-btn" onclick="window.saveSettings()">Publish Styles</button>
            </div>
            <div id="style-card" class="sub-view">
              <p><label>Star Size (px)</label><br><input id="card-star" class="premium-input" type="number" value="14" oninput="window.updatePreviews()" /></p>
              <label><input id="card-count" type="checkbox" checked onchange="window.updatePreviews()" /> Show Count</label>
              <p><button class="primary-btn" onclick="window.saveSettings()">Publish Styles</button></p>
            </div>
            <div id="style-carousel" class="sub-view">
              <p><select id="car-layout" class="filter-select"><option value="infinite">Infinite Auto-Scroll</option><option value="grid">Standard Grid</option><option value="masonry">Pinterest Masonry</option></select></p>
              <label><input id="car-autoplay" type="checkbox" checked /> Auto-Play Carousel</label>
              <p><input id="car-delay" class="premium-input" type="number" value="4000" placeholder="Slide Delay (ms)" /></p>
              <label><input id="car-arrows" type="checkbox" /> Show Arrows</label>
              <p><input id="car-limit" class="premium-input" type="number" value="10" placeholder="Max Reviews" /></p>
              <button class="primary-btn" onclick="window.saveSettings()">Publish Styles</button>
            </div>
          </div>
          <div class="panel">
            <h3>Live Preview</h3>
            <div class="filter-row"><button id="btn-desk-prev" class="secondary-btn active" onclick="window.setPreviewMode('desktop')">Desktop</button><button id="btn-mob-prev" class="secondary-btn" onclick="window.setPreviewMode('mobile')">Mobile</button></div>
            <div id="preview-container-wrap">
              <div id="preview-widget" class="sub-preview active preview-card">
                <h3 id="pre-title" class="pre-color-text-brand">Customer Reviews</h3>
                <button class="pre-color-primary" style="border:0; border-radius:999px; color:#fff; padding:10px 14px; font-weight:800;">Write Review</button>
                <p class="pre-color-star" style="font-size:22px;">★★★★★</p>
                <h4>Amazing Quality</h4><p class="pre-color-text">This product is absolutely amazing! The quality is top notch and it arrived perfectly.</p><p>Jane Doe ✓ Verified</p>
              </div>
              <div id="preview-card" class="sub-preview preview-card"><span id="pre-card-icon" class="pre-color-star">★</span> <span id="pre-card-count">4.8 (12)</span><h4>Sample Product</h4><p>$29.99</p></div>
              <div id="preview-carousel" class="sub-preview preview-card"><p class="pre-color-star">★★★★★</p><h4>Incredible!</h4><p>Best purchase I've made all year.</p><p>Sarah M.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section id="v-discounts" class="view"><h2 class="page-title">Discounts</h2><div class="panel lock-box"><h3>Discounts module placeholder</h3><p class="muted">Reserved for review-linked incentives, discount rules, and Shopify Function-backed offers. The module is intentionally inactive while the foundation is secured.</p></div></section>
      <section id="v-loyalty" class="view"><h2 class="page-title">Loyalty</h2><div class="panel lock-box"><h3>Loyalty module placeholder</h3><p class="muted">Reserved for points, tiers, rewards, and merchant loyalty settings. The module is intentionally inactive while the foundation is secured.</p></div></section>
      <section id="v-referrals" class="view"><h2 class="page-title">Referrals</h2><div class="panel lock-box"><h3>Referrals module placeholder</h3><p class="muted">Reserved for referral tracking, advocate links, friend offers, and attribution. The module is intentionally inactive while the foundation is secured.</p></div></section>

      <section id="v-manual" class="view">
        <h2 class="page-title">Manual Installation</h2>
        <div class="panel">
          <h3>1. Product Page Widget</h3>
          <pre>&lt;div class="rev-widget" data-id="{{ product.id }}" data-shop="{{ shop.domain }}"&gt;&lt;/div&gt;</pre>
          <h3>2. Global Carousel</h3>
          <p>Use the Global Review Carousel block from the theme/app extension.</p>
          <h3>3. Review Request Email Block</h3>
          <p><input id="flow-logo" class="premium-input" placeholder="Logo URL (optional)" oninput="window.generateFlowCode()" /></p>
          <p><input id="flow-heading" class="premium-input" value="Review your recent order" oninput="window.generateFlowCode()" /></p>
          <p><input id="flow-color" type="color" value="#111827" oninput="window.generateFlowCode()" /></p>
          <textarea id="flow-code-output" style="width:100%; min-height:180px;"></textarea>
          <p><button class="secondary-btn" onclick="window.copyFlowCode()">Copy Flow Code</button></p>
        </div>
      </section>
    </main>
  </div>

  <script src="/admin.js?v=secure-1"></script>
  <script src="/admin-review-manager-enhancements.js?v=secure-1"></script>
  <script src="/nectar-score-notch-fix.js?v=secure-1"></script>
  <script src="/admin-dashboard-analytics.js?v=secure-1"></script>
  <script src="/admin-email-tracking-enhancer.js?v=secure-1"></script>
  <script src="/admin-messaging-campaigns.js?v=secure-1"></script>
  <script src="/admin-help-drawer.js" defer></script>
</body>
</html>
