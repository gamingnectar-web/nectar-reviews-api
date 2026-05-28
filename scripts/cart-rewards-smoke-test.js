const { evaluateCart } = require('../src/modules/cart-rewards/services/cartRewardEngine');
const result = evaluateCart({ subtotal: 100 }, [{ threshold: 50 }, { threshold: 150 }]);
if (result.length !== 1) throw new Error('Cart rewards smoke test failed');
console.log('Cart rewards smoke test passed.');
