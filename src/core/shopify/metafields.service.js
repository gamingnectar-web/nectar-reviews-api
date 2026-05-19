const { shopifyFetch } = require('./shopify.service');

function productGidFromItemId(itemId) {
  const value = String(itemId || '');
  if (value.startsWith('gid://shopify/Product/')) return value;
  if (/^\d+$/.test(value)) return `gid://shopify/Product/${value}`;
  return value;
}

async function setProductReviewMetafields(shopDomain, itemId, summary) {
  const ownerId = productGidFromItemId(itemId);
  if (!ownerId || !String(ownerId).startsWith('gid://shopify/Product/')) {
    return { skipped: true, reason: 'itemId is not a Shopify product ID' };
  }

  const mutation = {
    query: `mutation SetReviewMetafields($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { key namespace value } userErrors { field message } } }`,
    variables: {
      metafields: [
        {
          ownerId,
          namespace: 'nectar_reviews',
          key: 'rating_average',
          type: 'number_decimal',
          value: String(summary.averageRating || 0)
        },
        {
          ownerId,
          namespace: 'nectar_reviews',
          key: 'rating_count',
          type: 'number_integer',
          value: String(summary.count || 0)
        }
      ]
    }
  };

  const result = await shopifyFetch('/graphql.json', { method: 'POST', shopDomain, body: mutation });
  const errors = result?.data?.metafieldsSet?.userErrors || [];
  if (errors.length) {
    const error = new Error(errors.map((entry) => entry.message).join(', '));
    error.shopify = result;
    throw error;
  }
  return result?.data?.metafieldsSet?.metafields || [];
}

module.exports = { setProductReviewMetafields, productGidFromItemId };
