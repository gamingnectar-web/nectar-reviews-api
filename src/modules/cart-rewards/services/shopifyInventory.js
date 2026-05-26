function variantGid(id) {
  const value = String(id || "");
  if (!value) return "";
  if (value.startsWith("gid://shopify/ProductVariant/")) return value;
  return `gid://shopify/ProductVariant/${value}`;
}

function variantNumericId(id) {
  const value = String(id || "");
  return value.replace("gid://shopify/ProductVariant/", "");
}

function indexAvailability(result) {
  const map = new Map();
  for (const item of result || []) {
    if (!item || !item.id) continue;
    const normalised = {
      id: item.id,
      numericId: variantNumericId(item.id),
      availableForSale: item.availableForSale !== false,
      inventoryQuantity: typeof item.inventoryQuantity === "number" ? item.inventoryQuantity : null,
      inventoryPolicy: item.inventoryPolicy || null,
      continueSelling: item.inventoryPolicy === "CONTINUE",
      title: item.title,
      productTitle: item.product?.title,
      handle: item.product?.handle,
      imageUrl: item.image?.url || item.product?.featuredImage?.url,
      checkedAt: new Date()
    };
    map.set(normalised.id, normalised);
    map.set(normalised.numericId, normalised);
  }
  return map;
}

async function fetchVariantAvailability({ adminGraphql, variantIds = [] }) {
  const ids = [...new Set(variantIds.map(variantGid).filter(Boolean))];
  if (!ids.length) return new Map();

  if (!adminGraphql) {
    return new Map();
  }

  const response = await adminGraphql(
    `query NectarRewardVariantAvailability($ids: [ID!]!) {
      nodes(ids: $ids) {
        __typename
        ... on ProductVariant {
          id
          title
          availableForSale
          inventoryQuantity
          inventoryPolicy
          image { url altText }
          product {
            id
            title
            handle
            featuredImage { url altText }
          }
        }
      }
    }`,
    { ids }
  );

  return indexAvailability(response?.nodes || response?.data?.nodes || []);
}

function legacyBehaviour(reward = {}) {
  if (reward.outOfStockBehaviour) return reward.outOfStockBehaviour;
  if (reward.inventoryPolicy === "allow_backorder") return "continue_selling";
  if (reward.inventoryPolicy === "disable_when_oos") return "disable";
  return "hide";
}

function resolveRewardAvailability({ reward, live, campaign }) {
  const behaviour = legacyBehaviour(reward) || campaign?.inventory?.soldOutBehaviour || "hide";

  let available = true;
  let inventoryQuantity = reward.inventoryQuantity;
  let source = "stored";
  let continueSelling = behaviour === "continue_selling";

  if (live) {
    available = live.availableForSale !== false;
    inventoryQuantity = live.inventoryQuantity;
    continueSelling = live.continueSelling || behaviour === "continue_selling";
    source = "shopify_live";
  } else if (typeof reward.availableForSale === "boolean") {
    available = reward.availableForSale;
  } else if (typeof reward.inventoryQuantity === "number") {
    available = reward.inventoryQuantity > 0;
  }

  if (!available && continueSelling) {
    return {
      available: true,
      soldOut: true,
      disabled: false,
      hidden: false,
      continuation: true,
      behaviour,
      inventoryQuantity,
      source
    };
  }

  if (!available && behaviour === "disable") {
    return {
      available: false,
      soldOut: true,
      disabled: true,
      hidden: false,
      continuation: false,
      behaviour,
      inventoryQuantity,
      source
    };
  }

  if (!available) {
    return {
      available: false,
      soldOut: true,
      disabled: true,
      hidden: true,
      continuation: false,
      behaviour,
      inventoryQuantity,
      source
    };
  }

  return {
    available: true,
    soldOut: false,
    disabled: false,
    hidden: false,
    continuation: false,
    behaviour,
    inventoryQuantity,
    source
  };
}

module.exports = {
  fetchVariantAvailability,
  resolveRewardAvailability,
  variantGid,
  variantNumericId
};
