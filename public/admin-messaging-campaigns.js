(function () {
  function mount() {
    const el = document.getElementById('nr-messaging-campaigns-mount');
    if (!el) return;
    el.innerHTML = `
      <h3 style="margin-top:0;">Messaging & Campaigns</h3>
      <p class="muted">Campaign analytics and email tracking remain connected to the secured API. Email provider setup is available through the backend endpoints and can be expanded here without changing the foundation.</p>
      <div class="grid-2" style="margin-bottom:0;">
        <div class="panel" style="box-shadow:none;"><p class="stat-label">Open tracking</p><h3 class="stat-value" style="font-size:24px;">Secured</h3></div>
        <div class="panel" style="box-shadow:none;"><p class="stat-label">Click tracking</p><h3 class="stat-value" style="font-size:24px;">Secured</h3></div>
      </div>`;
  }
  document.addEventListener('DOMContentLoaded', mount);
})();
