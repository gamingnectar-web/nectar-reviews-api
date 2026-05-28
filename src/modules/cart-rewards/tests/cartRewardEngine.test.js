const { evaluateCart } = require('../services/cartRewardEngine'); if (evaluateCart({ subtotal: 100 }, [{ threshold: 50 }]).length !== 1) throw new Error('cartRewardEngine smoke failed');
