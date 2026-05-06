const API = 'https://nectar-reviews-api.onrender.com/api'; 
const urlParams = new URLSearchParams(window.location.search);
const SHOP_DOMAIN = urlParams.get('shop') || 'your-dev-store.myshopify.com';
let data = [];
let chartInstance = null;
let currentAttributes = [];

document.addEventListener('DOMContentLoaded', () => {
    const labelInput = document.getElementById('attr-label');
    if (labelInput) {
        labelInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); window.addAttribute(); }
        });
    }
});

// Explicitly bind all UI functions to the global window to prevent scoping errors inside Shopify Iframe
window.tab = function(id) {
    const target = document.getElementById(id);
    if(!target) return; 
    
    document.querySelectorAll('.view, .tab-btn').forEach(el => el.classList.remove('active'));
    target.classList.add('active');
    
    const activeBtn = document.querySelector(`button[onclick="window.tab('${id}')"]`);
    if(activeBtn) activeBtn.classList.add('active');
    
    if(id === 'v-dash') window.loadStats();
};

window.subTab = function(controlId, previewId) {
    document.querySelectorAll('.sub-view, .sub-tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(controlId).classList.add('active');
    
    const activeBtn = document.querySelector(`button[onclick="window.subTab('${controlId}', '${previewId}')"]`);
    if(activeBtn) activeBtn.classList.add('active');
    
    if (previewId) {
        document.querySelectorAll('.sub-preview').forEach(el => el.classList.remove('active'));
        document.getElementById(previewId).classList.add('active');
    }
};

window.setPreviewMode = function(mode) {
    document.getElementById('btn-desk-prev').classList.toggle('active', mode === 'desktop');
    document.getElementById('btn-mob-prev').classList.toggle('active', mode === 'mobile');
    
    const prevContainer = document.getElementById('preview-container-wrap');
    if (mode === 'mobile') {
        prevContainer.style.maxWidth = '375px';
        prevContainer.style.margin = '0 auto';
        prevContainer.style.border = '12px solid #1a1a1a';
        prevContainer.style.borderRadius = '32px';
        prevContainer.style.overflow = 'hidden';
        prevContainer.style.backgroundColor = '#ffffff';
    } else {
        prevContainer.style.maxWidth = '100%';
        prevContainer.style.margin = '0';
        prevContainer.style.border = 'none';
        prevContainer.style.borderRadius = '0';
        prevContainer.style.overflow = 'visible';
        prevContainer.style.backgroundColor = 'transparent';
    }
};

window.toggleImportInst = function() {
    const platform = document.getElementById('import-platform-select').value;
    document.querySelectorAll('.import-inst-box').forEach(el => el.classList.remove('active'));
    document.getElementById(`inst-${platform}`).classList.add('active');
};

window.fetchMetafields = async function() {
    try {
        const res = await fetch(`${API}/admin/metafields`);
        if (res.ok) {
            const metafields = await res.json();
            const select = document.getElementById('attr-rule-val-meta');
            if(metafields.length === 0) {
                select.innerHTML = '<option value="">No metafields found on this store</option>';
                return;
            }
            select.innerHTML = metafields.map(m => `<option value="${m.key}">${m.name} (${m.key})</option>`).join('');
        }
    } catch(e) { console.error(e); }
};

window.toggleRuleInput = function() {
    const type = document.getElementById('attr-rule-type').value;
    if(type === 'tag') {
        document.getElementById('attr-rule-val-tag').style.display = 'block';
        document.getElementById('attr-rule-val-meta').style.display = 'none';
    } else {
        document.getElementById('attr-rule-val-tag').style.display = 'none';
        document.getElementById('attr-rule-val-meta').style.display = 'block';
        if(document.getElementById('attr-rule-val-meta').options.length <= 1) window.fetchMetafields();
    }
};

window.load = async function() {
    try {
        const res = await fetch(`${API}/admin/reviews?shopDomain=${SHOP_DOMAIN}&t=${Date.now()}`);
        if(res.ok) data = await res.json();
        
        const setRes = await fetch(`${API}/admin/settings?shopDomain=${SHOP_DOMAIN}&t=${Date.now()}`);
        if(setRes.ok) {
            const config = await setRes.json();
            if(config) {
                if(config.betaMode) {
                    document.getElementById('set-beta-enable').checked = config.betaMode.enabled || false;
                    document.getElementById('set-beta-email').value = config.betaMode.email || '';
                }

                document.getElementById('set-auto-enable').checked = config.autoApproveEnabled || false;
                document.getElementById('set-auto-type').value = config.autoApproveType || 'verified';
                document.getElementById('set-min-stars').value = config.autoApproveMinStars || 4;
                document.getElementById('set-seo').checked = config.seo?.richSnippets !== false; 
                
                currentAttributes = config.attributeProfiles || [];
                
                if(config.widgetStyles) {
                    document.getElementById('style-title').value = config.widgetStyles.widgetTitle || 'Customer Reviews';
                    document.getElementById('style-primary').value = config.widgetStyles.primaryColor || '#000000';
                    document.getElementById('style-star').value = config.widgetStyles.starColor || '#ffc700';
                    document.getElementById('style-text').value = config.widgetStyles.textSize || 15;
                }
                if(config.cardStyles) {
                    document.getElementById('card-star').value = config.cardStyles.starSize || 14;
                    document.getElementById('card-count').checked = config.cardStyles.showCount !== false;
                }
                if(config.carouselStyles) {
                    document.getElementById('car-layout').value = config.carouselStyles.layout || 'infinite';
                    document.getElementById('car-autoplay').checked = config.carouselStyles.autoplay !== false;
                    document.getElementById('car-delay').value = config.carouselStyles.delay || 4000;
                    document.getElementById('car-limit').value = config.carouselStyles.limit || 10;
                }
                window.updatePreviews();
                window.renderAttributes();
            }
        }
        window.renderLists();
        window.loadStats();
    } catch(e) { console.error("Init error:", e); }
};

window.loadStats = async function() {
    try {
        const res = await fetch(`${API}/admin/stats?shopDomain=${SHOP_DOMAIN}&t=${Date.now()}`);
        if(!res.ok) return;
        const stats = await res.json();
        
        document.getElementById('stat-total').innerText = (stats.sources.website + stats.sources.email + stats.sources.import) || 0;
        document.getElementById('stat-live').innerText = data.filter(r => r.status === 'accepted' && !r.isDeleted).length;

        const prodCardEl = document.getElementById('v-dash-prod-card');
        if (stats.topProduct && stats.topProduct.id !== "N/A") {
            const numericId = stats.topProduct.id;
            const count = stats.topProduct.count;
            const avgNum = parseFloat(stats.topProduct.averageRating);
            const fullStars = isNaN(avgNum) ? 0 : Math.round(avgNum);
            
            if (stats.topProduct.title) {
                prodCardEl.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 20px; width: 100%;">
                        <a href="https://${SHOP_DOMAIN}/admin/products/${numericId}" target="_blank" title="Open Product in Shopify Admin">
                            <img src="${stats.topProduct.image || 'https://cdn.shopify.com/s/images/admin/no-image-large.gif'}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        </a>
                        <div style="flex: 1;">
                            <p style="color: var(--text-light); font-weight: 600; font-size: 11px; text-transform: uppercase; margin:0; letter-spacing: 0.5px;">Most Reviewed Product</p>
                            <a href="https://${SHOP_DOMAIN}/admin/products/${numericId}" target="_blank" style="text-decoration: none; display: block; margin: 2px 0 6px 0;">
                                <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: var(--primary); -webkit-line-clamp: 2; -webkit-box-orient: vertical; display: -webkit-box; overflow: hidden; line-height: 1.2;">
                                    ${stats.topProduct.title}
                                </h3>
                            </a>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="color: var(--star); font-size: 14px; letter-spacing: 1px;">
                                    ${'★'.repeat(fullStars)}${'☆'.repeat(5-fullStars)}
                                </span>
                                <span style="font-weight: 700; font-size: 14px; color: var(--primary);">${avgNum.toFixed(1)}</span>
                                <span style="font-size: 13px; color: var(--text-light);">(${count} reviews)</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                prodCardEl.innerHTML = `
                    <div style="width: 100%;">
                        <p style="color: var(--text-light); font-weight: 600; font-size: 12px; text-transform: uppercase; margin:0;">Top Product ID</p>
                        <h1 id="stat-prod" style="font-size: 24px; margin: 5px 0;">
                            <a href="https://${SHOP_DOMAIN}/admin/products/${numericId}" target="_blank" style="color: var(--primary); text-decoration: none;">ID: ${numericId} ↗</a>
                        </h1>
                        <div style="display: flex; align-items: center; gap: 6px; margin-top: 5px;">
                            <span style="color: var(--star); font-size: 14px;">${'★'.repeat(fullStars)}${'☆'.repeat(5-fullStars)}</span>
                            <span style="font-size: 13px; color: var(--text-light);">(${count} reviews, avg: ${avgNum.toFixed(1)})</span>
                        </div>
                    </div>
                `;
            }
        } else {
            prodCardEl.innerHTML = `
                <div style="width: 100%;">
                    <p style="color: var(--text-light); font-weight: 600; font-size: 12px; text-transform: uppercase; margin:0;">Top Product</p>
                    <h1 style="font-size: 24px; margin: 5px 0;">No reviews yet</h1>
                </div>
            `;
        }

        const ctx = document.getElementById('chartSources').getContext('2d');
        if(chartInstance) chartInstance.destroy();
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Website Widget', 'Email Link', 'Imported CSV'],
                datasets: [{ data: [stats.sources.website, stats.sources.email, stats.sources.import], backgroundColor: ['#008060', '#005bd3', '#ffc700'] }]
            },
            options: { cutout: '75%', plugins: { legend: { position: 'bottom' } } }
        });
    } catch(e) {}
};

window.renderLists = function() {
    const query = document.getElementById('search-bar').value.toLowerCase();
    const status = document.getElementById('status-filter').value;
    const starF = document.getElementById('star-filter').value;
    
    let active = data.filter(r => !r.isDeleted);
    if(status !== 'all') active = active.filter(r => r.status === status);
    if(starF !== 'all') active = active.filter(r => r.rating === parseInt(starF));
    if(query) active = active.filter(r => (r.userId || '').toLowerCase().includes(query) || (r.comment || '').toLowerCase().includes(query));

    const trash = data.filter(r => r.isDeleted);

    document.getElementById('mgr-list').innerHTML = active.length ? active.map(r => window.buildCard(r, false)).join('') : '<p style="text-align:center; padding: 40px; color:#999;">No reviews match this filter.</p>';
    document.getElementById('trash-list').innerHTML = trash.length ? trash.map(r => window.buildCard(r, true)).join('') : '<p style="text-align:center; padding: 40px; color:#999;">Trash is empty.</p>';
};

window.buildCard = function(r, isTrash) {
    let verifyHtml = r.verifiedPurchase 
        ? `<div class="v-badge v-badge-yes" title="${r.verificationNote || 'Verified Purchase'}">✓ Verified Buyer</div>`
        : `<div style="display: flex; align-items: center; gap: 8px;">
             <div class="v-badge v-badge-no" title="Diagnostic: ${r.verificationNote || 'Could not verify.'}">⚠️ Unverified</div>
             <button onclick="window.manuallyVerify('${r._id}')" style="background: none; border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 600; color: var(--blue);">Verify</button>
           </div>`;

    const customerBox = r.email 
        ? `<a href="https://${SHOP_DOMAIN}/admin/customers?query=${encodeURIComponent(r.email)}" target="_blank" class="customer-link" title="Open Customer Profile">${r.userId || 'Guest'}</a>` 
        : `<strong style="font-size: 1.1rem;">${r.userId || 'Guest'}</strong>`;

    let attrHtml = '';
    if (r.attributes && Object.keys(r.attributes).length > 0) {
        attrHtml = `<div style="margin-top: 15px; border-top: 1px dashed var(--border); padding-top: 15px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">`;
        for (const [key, val] of Object.entries(r.attributes)) {
            attrHtml += `
                <div>
                    <div style="display:flex; justify-content:space-between; font-size: 10px; font-weight:700; color:var(--text-light); text-transform:uppercase; margin-bottom:6px;">
                        <span>${key}</span><span>${val}/10</span>
                    </div>
                    <div style="width:100%; height:6px; background:#e2e8f0; border-radius:3px; position:relative;">
                        <div style="position:absolute; left:${(val/10)*100}%; top:50%; transform:translate(-50%, -50%); width:25px; height:10px; background:#000; border-radius:2px;"></div>
                    </div>
                </div>
            `;
        }
        attrHtml += `</div>`;
    }

    return `
    <div class="review-card status-border-${r.status}">
        <div class="card-main">
            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                <div>${customerBox}</div>
                <div class="status-group">
                    <button onclick="window.updateStatus('${r._id}', 'accepted')" class="s-btn acc ${r.status==='accepted'?'active':''}" title="Accept">✓</button>
                    <button onclick="window.updateStatus('${r._id}', 'hold')" class="s-btn hld ${r.status==='hold'?'active':''}" title="Hold">⏸</button>
                    <button onclick="window.updateStatus('${r._id}', 'rejected')" class="s-btn rej ${r.status==='rejected'?'active':''}" title="Reject">✕</button>
                </div>
            </div>

            <div style="color:var(--star); margin-bottom:10px; font-size: 18px;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
            <div style="font-weight:700; margin-bottom:8px; font-size: 18px;">${r.headline || 'No Headline'}</div>
            <div style="color:#444; line-height:1.6; font-size: 15px;">${r.comment}</div>
            
            ${attrHtml}
            
            <button class="reply-toggle" onclick="window.toggleReplyBox('${r._id}')">💬 Reply to Customer</button>
            <div id="reply-box-${r._id}" class="reply-panel" style="display: ${r.reply ? 'block' : 'none'};">
                <textarea id="reply-text-${r._id}" class="reply-input" placeholder="Type your public reply...">${r.reply || ''}</textarea>
                <button id="reply-btn-${r._id}" class="post-btn" onclick="window.saveReply('${r._id}')">Publish Reply</button>
            </div>
        </div>
        
        <div class="card-side">
            <div>
                <div style="font-size: 12px; color: var(--text-light); margin-bottom: 8px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                    <span>Product ID:</span>
                    <a href="https://${SHOP_DOMAIN}/admin/products/${r.itemId}" target="_blank" style="color: var(--blue); font-weight: 700; text-decoration: none; padding: 4px 8px; background: #e0f2fe; border-radius: 6px; display: inline-block;">
                        ${r.itemId} ↗
                    </a>
                </div>
                
                <div style="font-size: 12px; color: var(--text-light); margin-bottom: 5px;">${new Date(r.createdAt).toLocaleDateString()}</div>
                <div style="font-size: 13px; color: var(--primary); font-weight: 600; margin-bottom: 5px;">${r.email || 'No Email'}</div>
                ${verifyHtml}
            </div>

            <div style="padding-top: 20px;">
                ${isTrash ? `<button class="restore-btn" onclick="window.toggleBin('${r._id}', false)">↺ Restore</button>` : `<button class="delete-btn" onclick="window.toggleBin('${r._id}', true)">🗑️ Trash</button>`}
            </div>
        </div>
    </div>`;
};

window.toggleReplyBox = function(id) {
    const box = document.getElementById(`reply-box-${id}`);
    if(box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
};

window.manuallyVerify = async function(id) {
    if(!confirm('Manually mark this review as a Verified Purchase?')) return;
    const r = data.find(x => x._id === id); 
    if(r) {
        r.verifiedPurchase = true;
        r.verificationNote = "Manually verified by admin";
    }
    window.renderLists();
    
    await fetch(`${API}/reviews/${id}`, { 
        method: 'PATCH', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({ verifiedPurchase: true, verificationNote: "Manually verified by admin" }) 
    });
    
    if(window.shopify && window.shopify.toast) window.shopify.toast.show('Review Verified');
};

window.updateStatus = async function(id, status) {
    const r = data.find(x => x._id === id); if(r) r.status = status;
    window.renderLists();
    fetch(`${API}/reviews/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status}) });
};

window.toggleBin = async function(id, isDeleted) {
    if(isDeleted && !confirm('Move to trash? It will be permanently deleted in 28 days.')) return;
    const r = data.find(x => x._id === id); if(r) r.isDeleted = isDeleted;
    window.renderLists();
    fetch(`${API}/reviews/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({isDeleted}) });
};

window.saveReply = async function(id) {
    const btn = document.getElementById(`reply-btn-${id}`);
    const originalText = btn.innerText;
    btn.innerText = 'Publishing...';
    btn.disabled = true;

    const text = document.getElementById(`reply-text-${id}`).value;
    const r = data.find(x => x._id === id); if(r) r.reply = text;
    
    try {
        await fetch(`${API}/reviews/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({reply: text}) });
        
        btn.innerText = 'Published!';
        if(window.shopify && window.shopify.toast) window.shopify.toast.show('Reply published');
        
        setTimeout(() => {
            btn.innerText = originalText;
            btn.disabled = false;
            window.toggleReplyBox(id);
        }, 1500);
    } catch(e) {
        btn.innerText = 'Error saving';
        setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 2000);
    }
};

window.renderAttributes = function() {
    const container = document.getElementById('attributes-list');
    if (currentAttributes.length === 0) {
        container.innerHTML = `<div style="color: var(--text-light); font-size: 13px;">No conditional rules created yet.</div>`;
        return;
    }
    container.innerHTML = currentAttributes.map((attr, i) => `
        <div class="attr-pill">
            <div style="display:flex; align-items:center;">
                <span class="attr-tag">${attr.type}</span>
                <span style="color: var(--text-light); font-family: monospace; margin-right: 15px;">${attr.condition}</span>
                <span style="font-weight: 800; color: var(--border); margin-right: 15px;">→</span>
                <span style="font-weight: 600;">Slider: '${attr.label}'</span>
            </div>
            <button style="background: none; border: none; color: var(--red); cursor: pointer; font-weight: 600;" onclick="window.removeAttribute(${i})">✕ Remove</button>
        </div>
    `).join('');
};

window.addAttribute = function() {
    const type = document.getElementById('attr-rule-type').value;
    const condition = type === 'tag' ? document.getElementById('attr-rule-val-tag').value.trim() : document.getElementById('attr-rule-val-meta').value;
    const label = document.getElementById('attr-label').value.trim();

    if (!condition || condition === 'undefined' || !label) {
        alert("Please fill out both the condition value and the slider name.");
        return;
    }

    if (currentAttributes.length < 8) {
        currentAttributes.push({ type: type, condition: condition, label: label });
        document.getElementById('attr-rule-val-tag').value = '';
        document.getElementById('attr-label').value = '';
        window.saveSettings();
        window.renderAttributes();
    }
};

window.removeAttribute = async function(index) {
    if(confirm("Are you sure you want to remove this slider rule?")) {
        currentAttributes.splice(index, 1);
        window.renderAttributes();
        await window.saveSettings();
    }
};

window.updatePreviews = function() {
    const title = document.getElementById('style-title').value || 'Customer Reviews';
    const primary = document.getElementById('style-primary').value;
    const star = document.getElementById('style-star').value;
    const txt = document.getElementById('style-text').value + 'px';
    const cardStar = document.getElementById('card-star').value + 'px';
    
    document.getElementById('pre-title').innerText = title;
    document.querySelectorAll('.pre-color-primary').forEach(el => el.style.background = primary);
    document.querySelectorAll('.pre-color-star').forEach(el => el.style.color = star);
    document.querySelectorAll('.pre-color-text').forEach(el => el.style.fontSize = txt);
    document.querySelectorAll('.pre-color-text-brand').forEach(el => el.style.color = primary);
    document.getElementById('pre-card-icon').style.fontSize = cardStar;
    document.getElementById('pre-card-count').style.display = document.getElementById('card-count').checked ? 'inline' : 'none';
};

window.saveSettings = async function() {
    const payload = {
        shopDomain: SHOP_DOMAIN,
        betaMode: {
            enabled: document.getElementById('set-beta-enable').checked,
            email: document.getElementById('set-beta-email').value.trim()
        },
        autoApproveEnabled: document.getElementById('set-auto-enable').checked,
        autoApproveType: document.getElementById('set-auto-type').value,
        autoApproveMinStars: parseInt(document.getElementById('set-min-stars').value),
        attributeProfiles: currentAttributes,
        seo: { richSnippets: document.getElementById('set-seo').checked },
        widgetStyles: {
            widgetTitle: document.getElementById('style-title').value,
            primaryColor: document.getElementById('style-primary').value,
            starColor: document.getElementById('style-star').value,
            textSize: parseInt(document.getElementById('style-text').value)
        },
        cardStyles: {
            starSize: parseInt(document.getElementById('card-star').value),
            showCount: document.getElementById('card-count').checked
        },
        carouselStyles: {
            layout: document.getElementById('car-layout').value,
            autoplay: document.getElementById('car-autoplay').checked,
            delay: parseInt(document.getElementById('car-delay').value) || 4000,
            showArrows: document.getElementById('car-arrows').checked,
            limit: parseInt(document.getElementById('car-limit').value) || 10
        }
    };
    await fetch(`${API}/admin/settings`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(window.shopify && window.shopify.toast) window.shopify.toast.show('Saved!');
};

let parsedCSVData = []; 
let csvHeaders = [];
let mappedReviews = [];

window.handleFileUpload = function() {
    const file = document.getElementById('csv-file').files[0]; if (!file) return;
    document.getElementById('file-name').innerText = `📄 ${file.name} selected`;
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: function(results) { 
        parsedCSVData = results.data; 
        csvHeaders = results.meta.fields; 
        window.buildMappingUI(); 
    }});
};

window.buildMappingUI = function() {
    document.getElementById('mapping-ui').style.display = 'block';
    const reqFields = [{ id: 'map-itemId', label: 'Product ID (Req)' }, { id: 'map-rating', label: 'Star Rating (Req)' }, { id: 'map-userId', label: 'Reviewer Name' }, { id: 'map-email', label: 'Reviewer Email' }, { id: 'map-headline', label: 'Review Title' }, { id: 'map-comment', label: 'Review Body' }, { id: 'map-date', label: 'Review Date' }];
    let html = '';
    reqFields.forEach(f => {
        let options = `<option value="">-- Ignore --</option>`;
        csvHeaders.forEach(h => {
            let s = ''; let hL = h.toLowerCase();
            if (f.id === 'map-itemId' && (hL.includes('product') || hL.includes('id'))) s = 'selected';
            if (f.id === 'map-rating' && (hL.includes('score') || hL.includes('rating'))) s = 'selected';
            if (f.id === 'map-userId' && (hL.includes('name') || hL.includes('user'))) s = 'selected';
            if (f.id === 'map-email' && hL.includes('email')) s = 'selected';
            if (f.id === 'map-headline' && hL.includes('title')) s = 'selected';
            if (f.id === 'map-comment' && (hL.includes('body') || hL.includes('content'))) s = 'selected';
            if (f.id === 'map-date' && hL.includes('date')) s = 'selected';
            options += `<option value="${h}" ${s}>${h}</option>`;
        });
        html += `<div><label style="font-size:13px; font-weight:600; display:block; margin-bottom:5px;">${f.label}</label><select id="${f.id}" class="filter-select">${options}</select></div>`;
    });
    document.getElementById('column-mappers').innerHTML = html;
    
    const btn = document.getElementById('import-submit-btn');
    btn.innerText = "Preview & Map Products";
    btn.onclick = window.generateStagingArea;
};

window.generateStagingArea = function() {
    const map = { itemId: document.getElementById('map-itemId').value, rating: document.getElementById('map-rating').value, userId: document.getElementById('map-userId').value, email: document.getElementById('map-email').value, headline: document.getElementById('map-headline').value, comment: document.getElementById('map-comment').value, createdAt: document.getElementById('map-date').value };
    if (!map.itemId || !map.rating) { alert("Product ID and Star Rating must be mapped."); return; }
    
    mappedReviews = parsedCSVData.map(row => ({ 
        itemId: row[map.itemId], 
        rating: row[map.rating], 
        userId: row[map.userId], 
        email: row[map.email], 
        headline: row[map.headline], 
        comment: row[map.comment], 
        createdAt: row[map.createdAt] 
    }));

    let tableRows = mappedReviews.map((r, i) => `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 12px; font-size: 13px;">${r.userId}</td>
            <td style="padding: 12px; font-size: 13px; color: var(--star);">${'★'.repeat(parseInt(r.rating) || 5)}</td>
            <td style="padding: 12px; font-size: 13px; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${r.comment}">${r.comment}</td>
            <td style="padding: 12px;">
                <input type="text" id="stage-item-${i}" class="search-input" style="padding: 8px 12px; font-size: 13px; font-family: monospace; cursor: pointer;" value="${r.itemId || ''}" placeholder="Click to search products..." onclick="window.openSearchModal(${i})" readonly>
            </td>
        </tr>
    `).join('');

    const stagingHtml = `
        <h3 style="margin-top: 40px; border-top: 1px solid var(--border); padding-top: 30px;">3. Smart Product Mapping</h3>
        <p style="color: var(--text-light); font-size: 14px; margin-bottom: 20px;">The system is automatically searching your live Shopify store to find the exact Numeric IDs for these products. If a box turns <span style="color: var(--red); font-weight: bold;">Red</span>, click it to manually select the product using the Shopify Product Picker.</p>
        
        <div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 20px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
            <table style="width: 100%; text-align: left; border-collapse: collapse;">
                <thead style="background: #f4f6f8; position: sticky; top: 0; z-index: 1;">
                    <tr>
                        <th style="padding: 12px; font-size: 12px; color: var(--text-light); text-transform: uppercase;">Reviewer</th>
                        <th style="padding: 12px; font-size: 12px; color: var(--text-light); text-transform: uppercase;">Rating</th>
                        <th style="padding: 12px; font-size: 12px; color: var(--text-light); text-transform: uppercase;">Review</th>
                        <th style="padding: 12px; font-size: 12px; color: var(--text-light); text-transform: uppercase; width: 250px;">Target Product ID</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
        
        <button id="final-import-btn" class="post-btn" style="background: var(--blue); width: 100%; height: 50px; font-size: 16px;" onclick="window.processFinalImport()">🚀 Go Live (Import to Database)</button>
    `;

    let existingStaging = document.getElementById('staging-area');
    if (!existingStaging) {
        existingStaging = document.createElement('div');
        existingStaging.id = 'staging-area';
        document.getElementById('mapping-ui').appendChild(existingStaging);
    }
    existingStaging.innerHTML = stagingHtml;

    window.validateStagingProducts();
};

window.validateStagingProducts = async function() {
    const btn = document.getElementById('final-import-btn');
    btn.innerText = "Auto-Mapping Products...";
    btn.disabled = true;

    for (let i = 0; i < mappedReviews.length; i++) {
        const input = document.getElementById(`stage-item-${i}`);
        let query = input.value.trim();
        if (!query) {
            input.classList.add('invalid-red');
            continue;
        }

        if (/^\d{10,}$/.test(query)) {
            input.classList.add('valid-green');
            continue;
        }

        try {
            let cleanQuery = query.includes('|') ? query.split('|').pop().trim() : query;
            const res = await fetch(`https://${SHOP_DOMAIN}/search/suggest.json?q=${encodeURIComponent(cleanQuery)}&resources[type]=product`);
            const data = await res.json();
            const products = data.resources.results.products;

            if (products.length > 0) {
                const cleanUrl = products[0].url.split('?')[0];
                const prodRes = await fetch(`https://${SHOP_DOMAIN}${cleanUrl}.js`);
                const prodData = await prodRes.json();
                
                input.value = prodData.id;
                input.classList.remove('invalid-red');
                input.classList.add('valid-green');
            } else {
                input.classList.add('invalid-red');
            }
        } catch(e) {
            input.classList.add('invalid-red');
        }
    }
    
    btn.innerText = "🚀 Go Live (Import to Database)";
    btn.disabled = false;
};

window.openSearchModal = async function(index) {
    if (window.shopify) {
        try {
            const selected = await window.shopify.resourcePicker({ type: 'product', multiple: false });
            if (selected && selected.length > 0) {
                const numericId = selected[0].id.split('/').pop();
                const input = document.getElementById(`stage-item-${index}`);
                input.value = numericId;
                input.classList.remove('invalid-red');
                input.classList.add('valid-green');
            }
        } catch(e) { console.log("Picker closed or failed", e); }
    } else {
        alert("Shopify interface not detected. Please paste the numeric Product ID manually.");
    }
};

window.processFinalImport = async function() {
    const btn = document.getElementById('final-import-btn'); 
    btn.innerText = "Importing..."; 
    btn.disabled = true;

    const finalPayload = mappedReviews.map((r, i) => ({
        ...r,
        itemId: document.getElementById(`stage-item-${i}`).value.trim()
    }));

    try {
        const res = await fetch(`${API}/reviews/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopDomain: SHOP_DOMAIN, reviews: finalPayload }) });
        if (res.ok) { 
            alert(`🎉 Import successful! Reviews are now live.`); 
            document.getElementById('mapping-ui').style.display = 'none'; 
            document.getElementById('staging-area').innerHTML = '';
            window.load(); 
            window.tab('v-mgr');
        } else {
            alert("Import failed. Please check server logs.");
        }
    } catch(e) { 
        alert("An error occurred during import."); 
    } finally { 
        btn.innerText = "🚀 Go Live (Import to Database)"; 
        btn.disabled = false; 
    }
};

window.load();
