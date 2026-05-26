module.exports = {
  key: 'discounts',
  name: 'Discounts',
  description: 'Create and manage discount rules, product targeting and reward codes.',
  defaultEnabled: false,
  admin: {
    navGroup: 'Commerce',
    navLabel: 'Discounts',
    html: '/modules/discounts/admin/discounts.html',
    js: '/modules/discounts/admin/discounts.js',
    css: '/modules/discounts/admin/discounts.css',
    staticDir: true
  },
  api: { basePath: '/api/discounts' },
  routeFactory: require('./routes/discounts.routes')
};
