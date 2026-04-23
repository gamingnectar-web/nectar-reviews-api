function buildCard(r, isTrash) {
        let verifyHtml = r.verifiedPurchase 
            ? `<div class="v-badge v-badge-yes" title="${r.verificationNote || 'Verified'}">✓ Verified Buyer</div>` 
            : `<div class="v-badge v-badge-no" title="Diagnostic: ${r.verificationNote || 'Unverified'}">⚠️ Unverified (Hover)</div>`;

        const customerBox = r.verifiedPurchase && r.email
            ? `<a href="https://admin.shopify.com/customers?query=${encodeURIComponent(r.email)}" target="_blank" class="customer-link" title="Open Customer Account">${r.userId}</a>` 
            : `<strong style="font-size: 1.05rem;">${r.userId}</strong>`;

        // 1. Render the Flavor Profile Bars (Added this back in!)
        let attrHTML = '';
        if (r.attributes && Object.keys(r.attributes).length > 0) {
            attrHTML = `<div style="margin-top: 20px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid var(--border); display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px;">`;
            for (const [key, val] of Object.entries(r.attributes)) {
                attrHTML += `
                    <div>
                        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-light); margin-bottom: 4px;">${key}</div>
                        <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; position: relative;">
                            <div style="width: ${(val/10)*100}%; height: 100%; background: var(--primary); border-radius: 3px;"></div>
                        </div>
                        <div style="font-size: 10px; font-weight: 600; text-align: right; margin-top: 4px;">${val}/10</div>
                    </div>
                `;
            }
            attrHTML += `</div>`;
        }

        // 2. Render the Product Tags cleanly separated at the bottom
        const tagsHtml = r.productTags && r.productTags.length > 0 
            ? `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border);">
                 <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-light); text-transform: uppercase; margin-right: 8px;">Product Tags:</span> 
                 ${r.productTags.map(t => `<span style="font-size: 0.75rem; background: #e2e8f0; padding: 2px 8px; border-radius: 12px; margin-right: 5px; display: inline-block; margin-bottom: 5px;">${t}</span>`).join('')}
               </div>`
            : '';

        const replyStateClass = r.reply ? 'has-reply' : 'no-reply';
        const replyText = r.reply ? '💬 Edit Reply' : '💬 Reply to Customer';
        const isReplyOpen = openReplyBoxes.has(r._id) ? 'block' : 'none';

        return `
        <div class="review-card status-border-${r.status}">
            <div class="card-main">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        ${customerBox} ${r.isSpam ? '<span style="color:var(--red); font-weight:bold; font-size:0.85rem; margin-left:8px;">[SPAM FLAGGED]</span>' : ''}
                        <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${r.email || 'No email provided'}</div>
                    </div>
                    
                    <div class="status-group">
                        <button onclick="updateStatus('${r._id}', 'accepted')" class="s-btn acc ${r.status==='accepted'?'active':''}" title="Accept">✓</button>
                        <button onclick="updateStatus('${r._id}', 'hold')" class="s-btn hld ${r.status==='hold'?'active':''}" title="Hold">⏸</button>
                        <button onclick="updateStatus('${r._id}', 'rejected')" class="s-btn rej ${r.status==='rejected'?'active':''}" title="Reject">✕</button>
                    </div>
                </div>

                <div class="stars" style="margin-top:15px;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
                <div class="headline">${r.headline || 'No Headline'}</div>
                <div class="comment">${r.comment}</div>
                
                ${attrHTML}
                ${tagsHtml}
                
                <div class="reply-container">
                    <button class="reply-pill ${replyStateClass}" onclick="toggleReplyBox('${r._id}')">${replyText}</button>
                    
                    <div id="reply-box-${r._id}" class="reply-panel" style="display: ${isReplyOpen};">
                        <textarea id="reply-text-${r._id}" class="reply-input" placeholder="Type your public reply...">${r.reply || ''}</textarea>
                        <button class="reply-btn" onclick="saveReply('${r._id}')">Publish Reply</button>
                    </div>
                </div>
            </div>
            
            <div class="card-side">
                <div>
                    <div class="pid">Product ID: ${r.itemId}</div>
                    ${r.orderId ? `<div style="font-size: 0.9rem; margin-bottom: 10px; color: var(--text-light); font-weight: 600;">Order #${r.orderId}</div>` : ''}
                    
                    <div style="display: flex; flex-direction: column; align-items: flex-end; margin-top: 8px;">
                        ${verifyHtml}
                        <button class="force-verify-btn" onclick="toggleVerify('${r._id}', ${!r.verifiedPurchase})">
                            ${r.verifiedPurchase ? 'Remove Verification' : 'Force Verify'}
                        </button>
                    </div>
                </div>

                <div style="padding-top: 20px;">
                    ${isTrash ? 
                        `<button class="action-pill restore-pill" onclick="toggleBin('${r._id}', false)">↺ Restore</button>` : 
                        `<button class="action-pill bin-pill" onclick="toggleBin('${r._id}', true)">🗑️ Move to Bin</button>`
                    }
                </div>
            </div>
        </div>`;
    }
