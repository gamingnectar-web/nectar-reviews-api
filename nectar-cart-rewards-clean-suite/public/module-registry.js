/*
  Nectar admin module registry.
  Keep app products here so the Shopify app can open one admin shell and route to
  the correct module folder.
*/
(function NectarModuleRegistry() {
  window.NECTAR_MODULES = [
    {
      id: 'reviews',
      productSlug: 'review-widget',
      label: 'review-widget',
      description: 'Reviews dashboard, review manager, messaging, import and visual customiser.',
      adminFolder: '/modules/reviews',
      legacy: true,
      defaultModule: true
    },
    {
      id: 'cart-rewards',
      productSlug: 'cart-rewards',
      label: 'Cart Milestone Rewards',
      description: 'Cart drawer, cart page and checkout reward milestones.',
      adminFolder: '/modules/cart-rewards',
      css: '/modules/cart-rewards/admin.css',
      script: '/modules/cart-rewards/admin.js'
    }
  ];
})();
