const reviewsModule = require('../../modules/reviews');
const messagingModule = require('../../modules/messaging');
const discountsModule = require('../../modules/discounts');
const loyaltyModule = require('../../modules/loyalty');
const helpModule = require('../../modules/help');

const availableModules = [reviewsModule, messagingModule, discountsModule, loyaltyModule, helpModule];

function registerModules(app) {
  for (const moduleDefinition of availableModules) {
    if (typeof moduleDefinition.register === 'function') {
      moduleDefinition.register(app);
      console.log(`🧩 Registered module: ${moduleDefinition.key}`);
    }
  }
}

function listAvailableModules() {
  return availableModules.map((moduleDefinition) => ({
    key: moduleDefinition.key,
    name: moduleDefinition.name,
    description: moduleDefinition.description || '',
    enabledByDefault: Boolean(moduleDefinition.enabledByDefault)
  }));
}

module.exports = { registerModules, listAvailableModules, availableModules };
