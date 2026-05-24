const { evaluateCartRewards } = require('../src/modules/cart-rewards/services/cartRewardEngine');

console.log('Cart Rewards smoke test loader OK:', typeof evaluateCartRewards === 'function');
