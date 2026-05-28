function evaluateCart(cart, tiers=[]){ const subtotal = Number(cart?.subtotal || 0); return tiers.filter(t => subtotal >= Number(t.threshold || 0)); } module.exports = { evaluateCart };
