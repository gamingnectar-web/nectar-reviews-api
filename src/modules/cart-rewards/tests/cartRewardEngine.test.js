const assert = require("assert");

function runPureEngineAssertions() {
  const { cartSubtotalMinorUnits } = require("../utils/money");
  const { isNectarRewardLine } = require("../services/cartRewardEngine");

  assert.equal(cartSubtotalMinorUnits({ items_subtotal_price: 5000 }), 5000);
  assert.equal(cartSubtotalMinorUnits({ total_price: 1234 }), 1234);

  assert.equal(
    isNectarRewardLine({ properties: { _nectar_reward: "true" } }),
    true
  );

  assert.equal(
    isNectarRewardLine({ properties: { gift: "true" } }),
    false
  );

  console.log("Cart reward engine pure assertions passed.");
}

runPureEngineAssertions();
