/*
  Nectar Reviews — Product search route addon

  Add this route to server.js before app.listen(...).

  It lets Messaging Test Pages search products when Shopify's embedded
  resourcePicker is unavailable.
*/

app.get('/api/admin/products/search', async (req, res) => {
  try {
    const queryText = String(req.query.q || '').trim();

    if (!queryText) {
      return res.json({ products: [] });
    }

    const data = await shopifyFetch(
      `/admin/api/2024-01/products.json?limit=20&fields=id,title,handle,image,variants,tags`
    );

    const lower = queryText.toLowerCase();

    const products = (data.products || [])
      .filter((product) => (
        String(product.title || '').toLowerCase().includes(lower) ||
        String(product.handle || '').toLowerCase().includes(lower) ||
        String(product.id || '').includes(queryText)
      ))
      .slice(0, 10)
      .map((product) => ({
        id: String(product.id || ''),
        title: product.title || 'Product',
        handle: product.handle || '',
        image: product.image ? product.image.src : '',
        variantId: product.variants && product.variants[0] ? String(product.variants[0].id) : '',
        quantity: 1,
        tags: typeof product.tags === 'string'
          ? product.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
          : [],
        metafields: {}
      }));

    return res.json({ products });
  } catch (error) {
    console.error('Product search failed:', error);
    return res.status(500).json({ error: 'Could not search products.' });
  }
});
