const helpContent = [
  {
    key: 'install',
    title: 'Install and connect Shopify',
    steps: [
      'Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET and APP_BASE_URL in Render.',
      'Open /auth/shopify/install?shop=your-shop.myshopify.com.',
      'Approve the app install in Shopify.',
      'Confirm /api/shopify/status?shopDomain=your-shop.myshopify.com returns installed true.'
    ]
  },
  {
    key: 'reviews',
    title: 'Set up reviews',
    steps: [
      'Enable the reviews module for the shop.',
      'Add the widget script or theme extension block to the product page.',
      'Create a test review from /api/admin/reviews/test.',
      'Approve the review and confirm the product summary updates.'
    ]
  },
  {
    key: 'messaging',
    title: 'Set up review request emails',
    steps: [
      'Enable the messaging module for the shop.',
      'Save SMTP settings in the messaging email settings endpoint.',
      'Send a test email.',
      'Send a review request and confirm the one-use link submits only once.'
    ]
  },
  {
    key: 'modules',
    title: 'Add new modules',
    steps: [
      'Create a folder under src/modules/new-module.',
      'Add index.js with key, name and register(app).',
      'Add routes, models and services inside that folder.',
      'Register the module in src/core/modules/module-registry.js.',
      'Add its key to ShopModules.enabledModules when a shop should access it.'
    ]
  }
];

module.exports = { helpContent };
