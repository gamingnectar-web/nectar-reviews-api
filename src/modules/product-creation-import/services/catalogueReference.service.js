const {
  listProductSeoExamples, getProfileValuesFromExistingProducts,
  getProductMetafieldDefinitions, listShopifyCollections,
  listRecentlyUsedProductVendors, listRecentlyUsedProductTypes
} = require('./shopifyProduct.service');

function findAboutBrandDefinition(defs = []) {
  const aliases = ['about_brand','about_the_brand','brand_about','brand_description'];
  return defs.find(d => aliases.includes(String(d.key || '').toLowerCase())) ||
    defs.find(d => /about\s*(the\s*)?brand|brand\s*description/i.test([d.name,d.label,d.key].filter(Boolean).join(' '))) ||
    null;
}

async function buildCatalogueReferenceContext({ shopDomain, draft = {} }) {
  const [seoExamples, profileValues, definitions, collections, vendors, productTypes] = await Promise.all([
    listProductSeoExamples({ shopDomain, limit: 80 }).catch(() => []),
    getProfileValuesFromExistingProducts({ shopDomain, limit: 150 }).catch(() => ({})),
    getProductMetafieldDefinitions({ shopDomain }).catch(() => []),
    listShopifyCollections({ shopDomain, limit: 250 }).catch(() => []),
    listRecentlyUsedProductVendors({ shopDomain, limit: 100 }).catch(() => []),
    listRecentlyUsedProductTypes({ shopDomain, limit: 100 }).catch(() => [])
  ]);
  const sameVendor = seoExamples.filter(x => !draft.vendor || String(x.vendor || '').toLowerCase() === String(draft.vendor).toLowerCase()).slice(0, 20);
  return {
    examples: sameVendor.length ? sameVendor : seoExamples.slice(0,20),
    profileValues, definitions, collections, vendors, productTypes,
    aboutBrandDefinition: findAboutBrandDefinition(definitions)
  };
}

module.exports = { buildCatalogueReferenceContext, findAboutBrandDefinition };
