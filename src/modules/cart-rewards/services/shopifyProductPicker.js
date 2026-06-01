function clampFirst(value) {
  const num = Number(value || 20);
  if (!Number.isFinite(num)) return 20;
  return Math.max(1, Math.min(50, Math.floor(num)));
}

function cleanQuery(value) {
  return String(value || '')
    .replace(/[\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function productSearchQuery(raw) {
  const q = cleanQuery(raw);
  if (!q) return 'status:active';
  if (/[:*()]/.test(q)) return q;
  const escaped = q.replace(/"/g, '\\"');
  return `title:*${escaped}* OR sku:*${escaped}* OR barcode:*${escaped}*`;
}

function variantSearchQuery(raw) {
  const q = cleanQuery(raw);
  if (!q) return 'inventory_quantity:>0';
  if (/[:*()]/.test(q)) return q;
  const escaped = q.replace(/"/g, '\\"');
  return `sku:*${escaped}* OR barcode:*${escaped}* OR title:*${escaped}*`;
}

function mapProduct(product) {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    vendor: product.vendor,
    imageUrl: product.featuredImage?.url,
    variants: (product.variants?.nodes || []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      availableForSale: variant.availableForSale,
      inventoryQuantity: variant.inventoryQuantity,
      inventoryPolicy: variant.inventoryPolicy,
      imageUrl: variant.image?.url || product.featuredImage?.url,
      price: variant.price,
      selectedOptions: variant.selectedOptions || []
    }))
  };
}

async function searchRewardProducts({ adminGraphql, query, first = 20 }) {
  if (!adminGraphql) {
    return {
      products: [],
      warning: 'No Shopify Admin GraphQL client supplied.'
    };
  }

  const limit = clampFirst(first);
  const q = cleanQuery(query);

  try {
    const response = await adminGraphql(`
      query SearchRewardProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query, sortKey: TITLE) {
          nodes {
            id
            title
            handle
            status
            vendor
            featuredImage { url altText }
            variants(first: 50) {
              nodes {
                id
                title
                sku
                availableForSale
                inventoryQuantity
                inventoryPolicy
                price
                selectedOptions { name value }
                image { url altText }
              }
            }
          }
        }
      }
    `, {
      query: productSearchQuery(q),
      first: limit
    });

    const products = response?.products?.nodes || response?.data?.products?.nodes || [];
    return {
      products: products.map(mapProduct),
      query: q,
      source: 'products'
    };
  } catch (productError) {
    // Some stores have stricter product query behaviour. Variant search is a useful fallback for SKU/barcode-heavy catalogs.
    try {
      const response = await adminGraphql(`
        query SearchRewardVariants($query: String!, $first: Int!) {
          productVariants(first: $first, query: $query, sortKey: TITLE) {
            nodes {
              id
              title
              sku
              availableForSale
              inventoryQuantity
              inventoryPolicy
              price
              selectedOptions { name value }
              image { url altText }
              product {
                id
                title
                handle
                status
                vendor
                featuredImage { url altText }
              }
            }
          }
        }
      `, {
        query: variantSearchQuery(q),
        first: limit
      });

      const variants = response?.productVariants?.nodes || response?.data?.productVariants?.nodes || [];
      const grouped = new Map();
      for (const variant of variants) {
        const product = variant.product || {};
        const key = product.id || variant.id;
        if (!grouped.has(key)) {
          grouped.set(key, {
            id: product.id,
            title: product.title,
            handle: product.handle,
            status: product.status,
            vendor: product.vendor,
            imageUrl: product.featuredImage?.url,
            variants: []
          });
        }
        grouped.get(key).variants.push({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          availableForSale: variant.availableForSale,
          inventoryQuantity: variant.inventoryQuantity,
          inventoryPolicy: variant.inventoryPolicy,
          imageUrl: variant.image?.url || product.featuredImage?.url,
          price: variant.price,
          selectedOptions: variant.selectedOptions || []
        });
      }

      return {
        products: Array.from(grouped.values()),
        query: q,
        source: 'productVariants',
        warning: productError.message ? `Product search fallback used: ${productError.message}` : ''
      };
    } catch (variantError) {
      variantError.publicMessage = variantError.message || 'Could not search Shopify products.';
      throw variantError;
    }
  }
}

module.exports = {
  searchRewardProducts
};
