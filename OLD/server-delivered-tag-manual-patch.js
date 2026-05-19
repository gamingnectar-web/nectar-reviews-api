/*
Manual server.js patch summary if you do not want to run apply-delivered-gate-patch.js

Add to Settings schema:
deliveryGate: {
  enabled: { type: Boolean, default: true },
  requiredOrderTag: { type: String, default: 'delivered' },
  blockReviewPageUntilDelivered: { type: Boolean, default: true }
}

Add helper functions before orderContainsProduct:
*/

function splitShopifyTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag || '').trim()).filter(Boolean);
  }

  return String(tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function orderHasRequiredDeliveryTag(order, requiredTag = 'delivered') {
  const target = String(requiredTag || 'delivered').trim().toLowerCase();
  if (!target) return true;
  const orderTags = splitShopifyTags(order?.tags).map((tag) => tag.toLowerCase());
  return orderTags.includes(target);
}

async function getDeliveryGate(shopDomain) {
  const settings = await Settings.findOne({ shopDomain }).lean();
  const gate = settings?.deliveryGate || {};

  return {
    enabled: gate.enabled !== false,
    requiredOrderTag: String(gate.requiredOrderTag || 'delivered').trim() || 'delivered',
    blockReviewPageUntilDelivered: gate.blockReviewPageUntilDelivered !== false
  };
}

async function checkOrderDeliveryGate(shopDomain, order) {
  const gate = await getDeliveryGate(shopDomain);

  if (!gate.enabled) {
    return { delivered: true, gate, note: 'Delivery gate is disabled.' };
  }

  const delivered = orderHasRequiredDeliveryTag(order, gate.requiredOrderTag);

  return {
    delivered,
    gate,
    note: delivered
      ? `Order has required delivery tag "${gate.requiredOrderTag}".`
      : `Order must have the "${gate.requiredOrderTag}" tag before review links are allowed.`
  };
}

/*
In /api/magic-link/order, after order exists and email matches, add:

const deliveryCheck = await checkOrderDeliveryGate(shopDomain, order);
if (deliveryCheck.gate.enabled && deliveryCheck.gate.blockReviewPageUntilDelivered && !deliveryCheck.delivered) {
  return res.status(403).json({
    error: 'Order not delivered yet',
    message: deliveryCheck.note,
    requiredOrderTag: deliveryCheck.gate.requiredOrderTag,
    delivered: false
  });
}

Then pass shopDomain into resolveReviewVerification and require the tag inside verification.
*/
