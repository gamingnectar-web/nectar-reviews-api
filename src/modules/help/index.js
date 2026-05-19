const routes = require('./help.routes');

module.exports = {
  key: 'help',
  name: 'Help',
  description: 'Deterministic setup drawer and checklists.',
  enabledByDefault: true,
  register(app) {
    app.use('/api/help', routes);
    app.use('/api/admin/help', routes);
  }
};
