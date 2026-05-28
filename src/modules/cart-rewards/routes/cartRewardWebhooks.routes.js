const express = require("express");
const CartRewardClaim = require("../models/CartRewardClaim");
const CartRewardEvent = require("../models/CartRewardEvent");

const router = express.Router();

/**
 * Wire this route behind your existing Shopify webhook HMAC verification middleware.
 */
router.post("/orders-paid", async (req, res, next) => {
  try {
    const order = req.body;
    const shopDomain = req.headers["x-shopify-shop-domain"] || req.shopDomain;
    const cartToken = order.cart_token || order.cartToken;

    const rewardLines = (order.line_items || []).filter((line) => {
      const properties = line.properties || [];
      return properties.some((property) => property.name === "_nectar_reward" && property.value === "true");
    });

    for (const line of rewardLines) {
      const claimTokenProperty = (line.properties || []).find((property) => property.name === "_nectar_claim_token");
      if (!claimTokenProperty) continue;

      const claim = await CartRewardClaim.findOne({
        shopDomain,
        cartToken,
        rewardVariantId: String(line.variant_id)
      });

      if (!claim) continue;

      claim.status = "converted";
      claim.orderId = String(order.id);
      claim.orderName = order.name;
      claim.convertedAt = new Date();
      await claim.save();

      await CartRewardEvent.create({
        shopDomain,
        campaignId: claim.campaignId,
        tierId: claim.tierId,
        rewardVariantId: claim.rewardVariantId,
        cartToken,
        eventType: "conversion",
        value: Number(order.current_total_price || order.total_price || 0) * 100,
        currencyCode: order.currency,
        properties: {
          orderId: order.id,
          orderName: order.name
        }
      });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
