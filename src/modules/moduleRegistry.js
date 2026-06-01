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
    id: 'discounts',
    productSlug: 'discounts',
    label: 'Discounts',
    description: 'Shared discount engine for reviews, loyalty, cart rewards and referrals.',
    status: 'active',
    adminFolder: 'public/modules/discounts',
    apiNamespace: '/api/admin/discounts'
  },

  {
    id: 'product-creation-import',
    productSlug: 'product-creation-import',
    label: 'PRODUCT CREATION & PRODUCT IMPORT',
    description: 'Create Shopify draft products from external URLs, invoice images, manual entry, or matched supplier lines.',
    status: 'beta',
    adminFolder: 'public/modules/product-creation-import',
    apiNamespace: '/api/admin/product-creation-import'
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
