function mountPlatformModules(app, deps = {}) {
  try { require('./cart-rewards').mount(app, deps); } catch (error) { console.warn('Cart rewards module skipped:', error.message); }
  try { require('./discounts').mount(app, deps); } catch (error) { console.warn('Discounts module skipped:', error.message); }
  try { require('./reviews').mount(app, deps); } catch (error) { console.warn('Reviews module skipped:', error.message); }
}
module.exports = { mountPlatformModules };
