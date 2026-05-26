module.exports = {
  key: 'cart-rewards',
  name: 'Cart Rewards',
  description: 'Run tiered cart incentives, free gift portals and drawer rewards.',
  defaultEnabled: false,
  admin: {
    navGroup: 'Commerce',
    navLabel: 'Cart Rewards',
    html: '/modules/cart-rewards/admin/cart-rewards.html',
    js: '/modules/cart-rewards/admin/cart-rewards.js',
    css: '/modules/cart-rewards/admin/cart-rewards.css',
    staticDir: true
  },
  api: { basePath: '/api/cart-rewards' },
  routeFactory: require('./routes/cart-rewards.routes')
};
