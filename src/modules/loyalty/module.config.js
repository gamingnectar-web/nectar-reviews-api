module.exports = {
  key: 'loyalty',
  name: 'Loyalty',
  description: 'Reward customers with points, ledgers and transparent earning history.',
  defaultEnabled: false,
  admin: {
    navGroup: 'Retention',
    navLabel: 'Loyalty',
    html: '/modules/loyalty/admin/loyalty.html',
    js: '/modules/loyalty/admin/loyalty.js',
    css: '/modules/loyalty/admin/loyalty.css',
    staticDir: true
  },
  api: { basePath: '/api/loyalty' },
  routeFactory: require('./routes/loyalty.routes')
};
