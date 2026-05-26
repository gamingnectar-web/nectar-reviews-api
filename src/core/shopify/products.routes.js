const express = require('express');
const { asyncHandler } = require('../middleware/async-handler');
const { requireShop } = require('../middleware/require-shop');
const { shopifyGraphql } = require('./shopify.client');

module.exports = function shopifyProductsRoutes() {
  const router = express.Router();

  router.get('/products', requireShop, asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const first = Math.min(Number(req.query.first || 12), 50);

    const query = `
      query ProductSearch($first: Int!, $query: String) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              status
              featuredImage { url altText }
              variants(first: 5) {
                edges { node { id title sku price inventoryQuantity } }
              }
            }
          }
        }
      }
    `;

    const result = await shopifyGraphql(req.shopDomain, query, {
      first,
      query: q ? `title:*${q}* OR sku:*${q}*` : null
    });

    const products = result.data.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      status: node.status,
      image: node.featuredImage?.url || '',
      variants: node.variants.edges.map((edge) => edge.node)
    }));

    res.json({ products });
  }));

  return router;
};
