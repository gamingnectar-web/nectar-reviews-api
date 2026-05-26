const modules = [
  {
    id: 'reviews',
    productSlug: 'review-widget',
    label: 'review-widget',
    description: 'Reviews dashboard, review manager, messaging, import and visual customiser.',
    status: 'active',
    defaultModule: true,
    adminFolder: 'public/modules/reviews',
    apiNamespace: '/api/admin'
  },
  {
    id: 'cart-rewards',
    productSlug: 'cart-rewards',
    label: 'Cart Milestone Rewards',
    description: 'Cart drawer, cart page and checkout reward milestones.',
    status: 'active',
    adminFolder: 'public/modules/cart-rewards',
    apiNamespace: '/api/cart-rewards'
  }
];

function listModules() {
  return modules.map((module) => ({ ...module }));
}

function getModule(idOrSlug) {
  const needle = String(idOrSlug || '').toLowerCase();
  return modules.find((module) => module.id === needle || module.productSlug === needle) || null;
}

module.exports = {
  modules,
  listModules,
  getModule
};
