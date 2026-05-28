// Backwards-compatible shim. New location: /modules/cart-rewards/admin.js
(function loadCartRewardsModuleShim() {
  if (window.NectarCartRewardsAdmin) return;
  var script = document.createElement('script');
  script.src = '/modules/cart-rewards/admin.js';
  script.defer = true;
  document.body.appendChild(script);
})();
