module.exports = {
  key: 'help',
  name: 'Help Centre',
  description: 'A deterministic setup guide and support drawer that does not require AI API costs.',
  defaultEnabled: true,
  admin: {
    navGroup: 'Support',
    navLabel: 'Help Centre',
    html: '/modules/help/admin/help.html',
    js: '/modules/help/admin/help.js',
    css: '/modules/help/admin/help.css',
    staticDir: true
  },
  api: { basePath: '/api/help' },
  routeFactory: require('./routes/help.routes')
};
