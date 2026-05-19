function renderReviewRequestEmail({ customerName, shopName, items, trackingOpenUrl }) {
  const safeShopName = shopName || 'our store';
  const itemButtons = (items || []).map((item) => `
    <p style="margin:18px 0">
      <strong>${escapeHtml(item.itemTitle || 'Recent purchase')}</strong><br>
      <a href="${escapeHtml(item.reviewUrl)}" style="display:inline-block;margin-top:8px;background:#0f172a;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px">Leave a review</a>
    </p>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:620px;margin:0 auto">
      <h1>How was your order?</h1>
      <p>Hi ${escapeHtml(customerName || 'there')}, thanks for shopping with ${escapeHtml(safeShopName)}.</p>
      <p>We’d love to hear your feedback.</p>
      ${itemButtons}
      ${trackingOpenUrl ? `<img src="${escapeHtml(trackingOpenUrl)}" width="1" height="1" alt="" style="display:none">` : ''}
    </div>`;

  const text = `Hi ${customerName || 'there'}, thanks for shopping with ${safeShopName}. Leave a review: ${(items || []).map((item) => item.reviewUrl).join(' ')}`;
  return { subject: `How was your order from ${safeShopName}?`, html, text };
}

function renderReviewRewardEmail({ customerName, shopName, discountCode, discountValue, discountType, appBaseUrl }) {
  const safeShopName = shopName || 'our store';
  const valueText = discountType === 'fixed_amount' ? `£${Number(discountValue || 0).toFixed(2)} off` : `${Number(discountValue || 0)}% off`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:620px;margin:0 auto">
      <h1>Thanks for your review</h1>
      <p>Hi ${escapeHtml(customerName || 'there')}, thanks for sharing your feedback with ${escapeHtml(safeShopName)}.</p>
      <p>Here’s your ${escapeHtml(valueText)} reward for your next order:</p>
      <p style="font-size:24px;letter-spacing:2px;background:#f8fafc;border:1px dashed #94a3b8;padding:16px;border-radius:12px;text-align:center"><strong>${escapeHtml(discountCode)}</strong></p>
      <p>Enter this code at checkout to redeem it.</p>
      ${appBaseUrl ? `<p><a href="${escapeHtml(appBaseUrl)}" style="display:inline-block;background:#0f172a;color:white;text-decoration:none;padding:12px 16px;border-radius:10px">Shop now</a></p>` : ''}
    </div>`;
  const text = `Thanks for your review. Your ${valueText} code for ${safeShopName} is: ${discountCode}`;
  return { subject: `Your ${valueText} review reward`, html, text };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

module.exports = { renderReviewRequestEmail, renderReviewRewardEmail };
