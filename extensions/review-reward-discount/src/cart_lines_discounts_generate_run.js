// Nectar Reviews - review reward discount function
// This is the checkout-side Function outline.
// Deploy it through Shopify CLI as a discount function extension.

export function cartLinesDiscountsGenerateRun(input) {
  const empty = { operations: [] };

  let config = {};
  try {
    config = JSON.parse(input.discount?.metafield?.value || '{}');
  } catch (error) {
    return empty;
  }

  const percentage = Number(config.percentage || 5);
  if (!percentage || percentage <= 0) return empty;

  const requiredEmail = String(config.email || '').toLowerCase().trim();
  const buyerEmail = String(
    input.cart?.buyerIdentity?.email ||
    input.cart?.buyerIdentity?.customer?.email ||
    ''
  ).toLowerCase().trim();

  // If buyer email is available, guard the reward code against another logged-in buyer.
  // Guest checkout might not provide email at this point, so Shopify usageLimit: 1 is still the fallback guard.
  if (requiredEmail && buyerEmail && requiredEmail !== buyerEmail) {
    return empty;
  }

  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: 'Review reward',
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: []
                  }
                }
              ],
              value: {
                percentage: {
                  value: percentage.toString()
                }
              }
            }
          ],
          selectionStrategy: 'FIRST'
        }
      }
    ]
  };
}
