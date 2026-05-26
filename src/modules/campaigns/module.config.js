module.exports = {
  key: 'campaigns',
  name: 'Campaigns',
  description: 'Calendar-based planning for product, review, loyalty and reward campaigns.',
  defaultEnabled: false,
  admin: {
    navGroup: 'Planning',
    navLabel: 'Campaigns',
    html: '/modules/campaigns/admin/campaigns.html',
    js: '/modules/campaigns/admin/campaigns.js',
    css: '/modules/campaigns/admin/campaigns.css',
    staticDir: true
  },
  api: { basePath: '/api/campaigns' },
  routeFactory: require('./routes/campaigns.routes')
};
