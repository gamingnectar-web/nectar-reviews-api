(async function() {
    const shopDomain = window.Shopify ? window.Shopify.shop : window.location.hostname;
    // CRITICAL: Replace with your actual Render URL
    const API_URL = 'https://nectar-reviews-api.onrender.com'; 

    let config = null;
    try {
        const res = await fetch(`${API_URL}/api/widget/config?shopDomain=${shopDomain}`);
        if(res.ok) config = await res.json();
    } catch(e) { console.error("Nectar Reviews: Failed to load config"); return; }

    if (!config) return;

    const styles = config.styles || {};
    const primaryColor = styles.primaryColor || '#000000';
    const starColor = styles.starColor || '#ffc700';

    function getStars(rating) {
        return `<span style="color: ${starColor}; font-size: 1.2em;">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</span>`;
    }

    // ==================================================
    // 1. MAIN PRODUCT WIDGET (The Review List & Form)
    // ==================================================
    const widgetContainer = document.querySelector('.rev-widget');
    if (widgetContainer) {
        const productId = widgetContainer.getAttribute('data-id');
        const res = await fetch(`${API_URL}/api/reviews/${productId}?shopDomain=${shopDomain}`);
        const reviews = await res.json();

        let reviewsHtml = '';
        if (reviews.length === 0) {
            reviewsHtml = `<p style="color: #666; text-align: center; padding: 20px;">${styles.emptyText || 'No reviews yet. Be the first!'}</p>`;
        } else {
            reviewsHtml = reviews.map(r => {
                let attrHtml = '';
                if (r.attributes && Object.keys(r.attributes).length > 0) {
                    attrHtml = `<div style="margin-top: 10px; font-size: 0.85em; color: #666; background: #fafafa; padding: 10px; border-radius: 4px;">
                        ${Object.entries(r.attributes).map(([k,v]) => `<strong>${k}:</strong> ${v}/10`).join(' &nbsp;|&nbsp; ')}
                    </div>`;
                }
                return `
                <div style="border-bottom: 1px solid #eee; padding: 20px 0;">
                    <div style="display: flex; justify-content: space-between;">
                        <strong style="font-size: 1.1em;">${r.userId} ${r.verifiedPurchase ? '<span style="color: #008060; font-size: 0.8em; margin-left: 5px;">✓ Verified</span>' : ''}</strong>
                        <span style="color: #999; font-size: 0.9em;">${new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style="margin-top: 5px;">${getStars(r.rating)}</div>
                    <h4 style="margin: 8px 0;">${r.headline || ''}</h4>
                    <p style="margin: 0; line-height: 1.6; color: #444;">${r.comment}</p>
                    ${attrHtml}
                    ${r.reply ? `<div style="margin-top: 15px; border-left: 3px solid ${primaryColor}; padding-left: 15px; background: #fafafa; padding: 10px;"><strong>Store Reply:</strong><br>${r.reply}</div>` : ''}
                </div>`;
            }).join('');
        }

        let sliderHtml = '';
        if (config.profiles && config.profiles.length > 0 && window.meta) {
            const productTags = window.meta.product ? window.meta.product.tags : [];
            const activeSliders = config.profiles.filter(rule => {
                if (rule.type === 'tag' && productTags.includes(rule.condition)) return true;
                return false; 
            });

            if (activeSliders.length > 0) {
                sliderHtml = `<div style="margin-bottom: 15px; padding: 15px; background: #fafafa; border-radius: 6px;">
                    <p style="margin:0 0 10px 0; font-weight:bold; font-size:14px;">Product Attributes:</p>
                    ${activeSliders.map((s, i) => `
                        <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                            <span>${s.label}</span>
                            <input type="range" id="attr-slide-${i}" data-label="${s.label}" min="1" max="10" value="5" style="width: 150px; accent-color: ${primaryColor};">
                        </div>
                    `).join('')}
                </div>`;
            }
        }

        const formHtml = `
            <div id="nectar-form" style="display:none; background: #fafafa; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #eee;">
                <h3 style="margin-top:0; margin-bottom: 15px;">Write a Review</h3>
                <input type="text" id="n-name" placeholder="Your Name" style="width:100%; margin-bottom:10px; padding:12px; box-sizing:border-box; border: 1px solid #ddd; border-radius: 4px;">
                <input type="email" id="n-email" placeholder="Your Email (For Verification)" style="width:100%; margin-bottom:10px; padding:12px; box-sizing:border-box; border: 1px solid #ddd; border-radius: 4px;">
                <input type="text" id="n-order" placeholder="Order Number (Optional)" style="width:100%; margin-bottom:10px; padding:12px; box-sizing:border-box; border: 1px solid #ddd; border-radius: 4px;">
                <select id="n-rating" style="width:100%; margin-bottom:10px; padding:12px; box-sizing:border-box; border: 1px solid #ddd; border-radius: 4px;">
                    <option value="5">5 Stars</option><option value="4">4 Stars</option><option value="3">3 Stars</option><option value="2">2 Stars</option><option value="1">1 Star</option>
                </select>
                <input type="text" id="n-head" placeholder="Review Title" style="width:100%; margin-bottom:10px; padding:12px; box-sizing:border-box; border: 1px solid #ddd; border-radius: 4px;">
                <textarea id="n-body" placeholder="Your Review" style="width:100%; height:100px; margin-bottom:10px; padding:12px; box-sizing:border-box; border: 1px solid #ddd; border-radius: 4px; resize: vertical;"></textarea>
                ${sliderHtml}
                <button id="n-submit" style="background:${primaryColor}; color:#fff; border:none; padding:14px 20px; border-radius:4px; cursor:pointer; font-weight:bold; width:100%; font-size: 16px;">Submit Review</button>
            </div>
        `;

        widgetContainer.innerHTML = `
            <div style="font-family: inherit; max-width: 800px; margin: 0 auto; padding: 20px 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${primaryColor}; padding-bottom: 15px; margin-bottom: 20px;">
                    <h2 style="margin:0; font-size: 1.5em;">${styles.widgetTitle || 'Customer Reviews'}</h2>
                    <button onclick="document.getElementById('nectar-form').style.display='block'" style="background:${primaryColor}; color:white; border:none; padding:10px 20px; cursor:pointer; font-weight:bold; border-radius: 4px;">Write a Review</button>
                </div>
                ${formHtml}
                <div id="nectar-review-list">${reviewsHtml}</div>
            </div>
        `;

        document.getElementById('n-submit').addEventListener('click', async () => {
            const attrInputs = document.querySelectorAll('input[id^="attr-slide-"]');
            let capturedAttributes = {};
            attrInputs.forEach(inp => capturedAttributes[inp.getAttribute('data-label')] = parseInt(inp.value));

            const payload = {
                shopDomain: shopDomain,
                itemId: productId,
                userId: document.getElementById('n-name').value,
                email: document.getElementById('n-email').value,
                orderId: document.getElementById('n-order').value,
                rating: parseInt(document.getElementById('n-rating').value),
                headline: document.getElementById('n-head').value,
                comment: document.getElementById('n-body').value,
                attributes: capturedAttributes
            };
            
            document.getElementById('n-submit').innerText = "Submitting...";
            await fetch(`${API_URL}/api/reviews`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
            document.getElementById('nectar-form').innerHTML = `<p style="color: #008060; font-weight:bold; padding: 20px 0; text-align: center;">✅ Thank you! Your review has been submitted.</p>`;
        });
    }

    // ==================================================
    // 2. THE CAROUSEL LOGIC
    // ==================================================
    const carouselContainer = document.querySelector('.rev-carousel');
    if (carouselContainer && config.carouselStyles) {
        const res = await fetch(`${API_URL}/api/global-reviews?shopDomain=${shopDomain}`);
        const allReviews = await res.json();

        if (allReviews.length > 0) {
            const layout = config.carouselStyles.layout || 'infinite';
            
            const cHtml = allReviews.map(r => `
                <div style="min-width: 300px; max-width: 350px; background: #fff; padding: 25px; border: 1px solid #eaeaea; border-radius: 8px; flex-shrink: 0; box-shadow: 0 4px 6px rgba(0,0,0,0.02); display: inline-block;">
                    <div>${getStars(r.rating)}</div>
                    <h4 style="margin: 10px 0 5px 0;">${r.headline || ''}</h4>
                    <p style="margin: 0 0 15px 0; font-size: 0.95em; color: #555; line-height: 1.5;">"${r.comment}"</p>
                    <div style="font-weight: bold; font-size: 0.9em; color: ${primaryColor};">${r.userId} ${r.verifiedPurchase ? '<span style="color: #008060;">✓</span>' : ''}</div>
                </div>
            `).join('');

            if (layout === 'grid') {
                carouselContainer.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; padding: 20px;">${cHtml}</div>`;
            } else if (layout === 'masonry') {
                 carouselContainer.innerHTML = `<div style="column-count: 3; column-gap: 20px; padding: 20px;">${cHtml.replace(/display: inline-block;/g, 'display: inline-block; margin-bottom: 20px; width: 100%; box-sizing: border-box;')}</div>`;
            } else {
                // Infinite Auto-Scroll Logic
                carouselContainer.innerHTML = `
                    <div id="nectar-scroll-track" style="overflow-x: auto; display: flex; gap: 20px; padding: 20px 5px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; scroll-behavior: smooth;">
                        ${cHtml}
                    </div>
                `;

                if (config.carouselStyles.autoplay) {
                    const track = document.getElementById('nectar-scroll-track');
                    setInterval(() => {
                        if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 10) {
                            track.scrollLeft = 0; // Loop back
                        } else {
                            track.scrollBy({ left: 320, behavior: 'smooth' }); // Scroll one card width
                        }
                    }, config.carouselStyles.delay || 4000);
                }
            }
        }
    }

    // ==================================================
    // 3. BULK REVIEW PAGE LOGIC
    // ==================================================
    const bulkContainer = document.querySelector('.rev-global-page');
    if (bulkContainer) {
        const res = await fetch(`${API_URL}/api/global-reviews?shopDomain=${shopDomain}`);
        const allReviews = await res.json();

        if (allReviews.length > 0) {
            const html = allReviews.map(r => `
                <div style="background: #fff; border: 1px solid #eaeaea; padding: 25px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between;">
                        <strong style="font-size: 1.1em;">${r.userId} ${r.verifiedPurchase ? '<span style="color: #008060; font-size: 0.8em; margin-left: 5px;">✓ Verified Buyer</span>' : ''}</strong>
                        <span style="color: #999; font-size: 0.9em;">${new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style="margin-top: 5px;">${getStars(r.rating)}</div>
                    <h4 style="margin: 10px 0;">${r.headline || ''}</h4>
                    <p style="margin: 0; line-height: 1.6; color: #444;">${r.comment}</p>
                    <div style="margin-top: 15px; font-size: 0.85em; color: #666; font-weight: 600;">Reviewed on: ${r.itemId}</div>
                </div>
            `).join('');

            bulkContainer.innerHTML = `
                <div style="max-width: 800px; margin: 0 auto; padding: 40px 20px;">
                    <h1 style="text-align: center; margin-bottom: 40px;">What Our Customers Are Saying</h1>
                    ${html}
                </div>
            `;
        }
    }
})();