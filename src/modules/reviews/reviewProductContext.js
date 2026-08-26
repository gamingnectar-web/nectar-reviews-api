const { cleanText } = require('../../utils/validation');

function numericShopifyId(value = '') {
  const matches = String(value || '').match(/\d{5,}/g) || [];
  return matches.length ? matches[matches.length - 1] : '';
}

function splitShopifyTags(value) {
  if (Array.isArray(value)) return value.map((tag) => cleanText(tag, 80)).filter(Boolean);
  return String(value || '').split(',').map((tag) => cleanText(tag, 80)).filter(Boolean);
}

function metafieldRuleKeys(attributeProfiles = []) {
  return new Set((Array.isArray(attributeProfiles) ? attributeProfiles : [])
    .filter((profile) => ['metafield', 'metafieldkey'].includes(String(profile.type || profile.ruleType || '').toLowerCase().replace(/[^a-z]/g, '')))
    .map((profile) => cleanText(profile.condition || profile.value || '', 160).toLowerCase())
    .filter(Boolean));
}

function matchingReviewSliders(product = {}, attributeProfiles = []) {
  const tags = splitShopifyTags(product.tags).map((tag) => tag.toLowerCase());
  const metafields = Array.isArray(product.metafields) ? product.metafields : [];
  return (Array.isArray(attributeProfiles) ? attributeProfiles : []).filter((profile) => {
    const label = cleanText(profile.label || '', 80);
    if (!label) return false;
    const type = String(profile.type || profile.ruleType || '').toLowerCase().replace(/[^a-z]/g, '');
    const condition = cleanText(profile.condition || profile.value || '', 160).toLowerCase();
    if (type === 'all' || type === 'global') return true;
    if (!condition) return false;
    if (type === 'tag' || type === 'producttag') return tags.includes(condition);
    if (type === 'product' || type === 'productid') {
      const target = numericShopifyId(condition);
      return [product.productId, product.id].some((value) => numericShopifyId(value) === target);
    }
    if (type === 'vendor') return String(product.vendor || '').toLowerCase() === condition;
    if (type === 'type' || type === 'producttype') return String(product.productType || product.type || '').toLowerCase() === condition;
    if (type === 'metafield' || type === 'metafieldkey') {
      return metafields.some((field) => {
        const key = String(field?.key || '').toLowerCase();
        const namespaced = `${String(field?.namespace || '').toLowerCase()}.${key}`;
        return condition === key || condition === namespaced;
      });
    }
    return false;
  }).map((profile) => ({
    type: cleanText(profile.type || '', 40),
    condition: cleanText(profile.condition || '', 160),
    label: cleanText(profile.label || '', 80),
  }));
}

module.exports = { numericShopifyId, splitShopifyTags, metafieldRuleKeys, matchingReviewSliders };
