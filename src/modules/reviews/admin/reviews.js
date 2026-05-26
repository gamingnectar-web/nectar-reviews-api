(function () {
  async function api(path, options = {}) {
    return window.NectarAdmin.api(path, options);
  }

  function reviewCard(review) {
    return `
      <article class="list-card">
        <div>
          <strong>${review.title || 'Untitled review'}</strong>
          <p>${review.body || ''}</p>
          <small>${review.rating}★ · ${review.authorName || 'Customer'} · ${review.status || 'pending'} · ${review.verifiedPurchase ? 'Verified' : 'Unverified'}</small>
        </div>
        <div class="button-row">
          <button data-approve-review="${review._id || review.id}">Approve</button>
          <button data-reject-review="${review._id || review.id}">Reject</button>
        </div>
      </article>`;
  }

  async function load(root) {
    const [summary, all] = await Promise.all([
      api('/api/reviews/stats/summary'),
      api('/api/reviews/admin/all?limit=25')
    ]);

    root.querySelector('[data-reviews-count]').textContent = summary.count ?? 0;
    root.querySelector('[data-reviews-average]').textContent = summary.average ?? '0.00';
    root.querySelector('[data-reviews-list]').innerHTML = (all.reviews || []).map(reviewCard).join('') || '<p class="muted">No reviews yet.</p>';
  }

  window.NectarModules = window.NectarModules || {};
  window.NectarModules.reviews = async function initReviews(root) {
    await load(root);

    root.querySelector('[data-action="refresh-reviews"]').addEventListener('click', () => load(root));

    root.querySelector('[data-review-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await api('/api/reviews', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      event.currentTarget.reset();
      await load(root);
    });

    root.querySelector('[data-token-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const token = await api('/api/reviews/tokens', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      root.querySelector('[data-token-output]').textContent = JSON.stringify(token, null, 2);
    });

    root.addEventListener('click', async (event) => {
      const approveId = event.target.closest('[data-approve-review]')?.dataset.approveReview;
      const rejectId = event.target.closest('[data-reject-review]')?.dataset.rejectReview;
      if (!approveId && !rejectId) return;
      await api(`/api/reviews/admin/${approveId || rejectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: approveId ? 'approved' : 'rejected' })
      });
      await load(root);
    });
  };
})();
