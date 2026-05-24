async function searchRewardProducts({ adminGraphql, query, first = 20 }) {
  if (!adminGraphql) {
    return {
      products: [],
      warning: 'No Shopify Admin GraphQL client supplied.'
    };
  }

  const response = await adminGraphql(`
    query SearchRewardProducts($query: String!, $first: Int!) {
      products(first: $first, query: $query) {
        nodes {
          id
          title
          handle
          featuredImage { url altText }
          variants(first: 20) {
            nodes {
              id
              title
              sku
              availableForSale
              inventoryQuantity
              inventoryPolicy
              price
              image { url altText }
            }
          }
        }
      }
    }
  `, {
    query,
    first
  });

  const products = response?.products?.nodes || response?.data?.products?.nodes || [];

  return {
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      imageUrl: product.featuredImage?.url,
      variants: (product.variants?.nodes || []).map((variant) => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        availableForSale: variant.availableForSale,
        inventoryQuantity: variant.inventoryQuantity,
        inventoryPolicy: variant.inventoryPolicy,
        imageUrl: variant.image?.url || product.featuredImage?.url,
        price: variant.price
      }))
    }))
  };
}

module.exports = {
  searchRewardProducts
};
