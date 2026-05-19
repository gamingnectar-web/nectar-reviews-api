const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const reviews = require('./reviews.service');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const token = String(req.query.token || '');
  let link = null;
  try {
    link = token ? await reviews.getRequestLink(token) : null;
  } catch (error) {
    return res.status(error.statusCode || 400).send(`<h1>Review link unavailable</h1><p>${error.message}</p>`);
  }

  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Leave a review</title><link rel="stylesheet" href="/review-form.css"></head>
<body><main class="review-page"><h1>Review ${escapeHtml(link.itemTitle || 'your product')}</h1><p>Thanks for sharing your feedback.</p>
<form id="reviewForm">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<label>Rating<select name="rating" required><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select></label>
<label>Headline<input name="headline" maxlength="120"></label>
<label>Comment<textarea name="comment" required rows="5"></textarea></label>
<label>Display name <small>(optional, shown publicly if provided)</small><input name="customerName" value=""></label><label><input type="checkbox" name="displayNameConsent" value="true"> Show this display name publicly</label>
<button type="submit">Submit review</button>
</form><p id="status"></p></main>
<script>
document.getElementById('reviewForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  payload.rating = Number(payload.rating);
  const response = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  document.getElementById('status').textContent = response.ok ? 'Thank you. Your review has been submitted.' : (data.error || 'Could not submit review.');
  if (response.ok) event.currentTarget.style.display = 'none';
});
</script></body></html>`);
}));

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

module.exports = router;
