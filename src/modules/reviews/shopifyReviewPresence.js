const { Review } = require('../../models');
const { env } = require('../../config/env');
const { shopifyFetch } = require('../../utils/shopify');

const REQUIRED_REVIEW_PROGRAM_SCOPES = [
  'write_product_reviews',
  'read_metaobjects',
  'read_customers',
  'read_orders',
  'read_products',
];

const WORKFLOW_COMPANION_PARITY_SCOPES = [
  'read_products',
  'write_products',
  'read_customers',
  'write_customers',
  'read_orders',
  'write_orders',
  'read_draft_orders',
  'read_companies',
  'read_content',
  'read_metaobject_definitions',
  'read_metaobjects',
  'read_locations',
  'read_markets',
];

async function graphql(shopDomain, query, variables = {}) {
  const payload = await shopifyFetch(`/admin/api/${env.shopifyApiVersion}/graphql.json`, {
    shopDomain,
    method: 'POST',
    body: JSON.stringify({ query, variables }),
  });
  if (payload.errors?.length) {
    throw new Error(`Shopify GraphQL failed: ${JSON.stringify(payload.errors).slice(0, 1800)}`);
  }
  return payload.data || {};
}

async function currentInstallation(shopDomain) {
  const data = await graphql(shopDomain, `query E8CurrentInstallation {
    currentAppInstallation {
      id
      launchUrl
      app { id title handle developerName developerType }
      accessScopes { handle }
    }
  }`);
  return data.currentAppInstallation || null;
}

async function optionalExternalApps(shopDomain, scopes) {
  if (!scopes.includes('read_apps')) return { available: false, apps: [] };
  try {
    const data = await graphql(shopDomain, `query E8InstalledApps {
      appInstallations(first:100) {
        nodes {
          app { id title handle developerName developerType }
          launchUrl
        }
      }
    }`);
    const names = /yotpo|workflow companion|workflow webhooks|review/i;
    return {
      available: true,
      apps: (data.appInstallations?.nodes || []).filter((row) =>
        names.test(`${row.app?.title || ''} ${row.app?.handle || ''}`)
      ),
    };
  } catch (error) {
    return { available: false, apps: [], error: error.message };
  }
}

async function sampleNativeReviewFields(shopDomain) {
  const data = await graphql(shopDomain, `query E8ReviewMetafieldSample {
    products(first:20) {
      nodes {
        id
        title
        handle
        rating: metafield(namespace:"reviews", key:"rating") { value type }
        ratingCount: metafield(namespace:"reviews", key:"rating_count") { value type }
      }
    }
  }`);
  const rows = data.products?.nodes || [];
  return {
    sampled: rows.length,
    populated: rows.filter((x) => x.rating?.value || x.ratingCount?.value).length,
    missing: rows.filter((x) => !x.rating?.value && !x.ratingCount?.value).length,
    rows,
  };
}

async function getShopifyReviewPresence(shopDomain) {
  const filter = {
    shopDomain,
    status: 'accepted',
    isDeleted: { $ne: true },
    isTestReview: { $ne: true },
  };

  const [installation, localReviewCount, localProductIds, nativeFields] = await Promise.all([
    currentInstallation(shopDomain),
    Review.countDocuments(filter),
    Review.distinct('itemId', filter),
    sampleNativeReviewFields(shopDomain),
  ]);

  const scopes = (installation?.accessScopes || []).map((x) => x.handle);
  const external = await optionalExternalApps(shopDomain, scopes);
  const missingReviewProgramScopes = REQUIRED_REVIEW_PROGRAM_SCOPES.filter((scope) => !scopes.includes(scope));
  const missingAutomationScopes = WORKFLOW_COMPANION_PARITY_SCOPES.filter((scope) => !scopes.includes(scope));
  const appTitle = installation?.app?.title || '';
  const identityLooksElev8 = /elev8/i.test(appTitle);

  return {
    app: installation?.app || null,
    launchUrl: installation?.launchUrl || '',
    scopes,
    identity: {
      ok: identityLooksElev8,
      currentTitle: appTitle,
      recommendation: identityLooksElev8
        ? 'The Shopify app is visibly branded as ELEV8.'
        : 'Rename the production Shopify app to ELEV8 in the Shopify Dev Dashboard so merchants and Shopify surfaces do not see a generic review-widget/backend identity.',
    },
    localReviews: {
      accepted: localReviewCount,
      productsWithAcceptedReviews: localProductIds.length,
    },
    nativeRatingFields: nativeFields,
    standardReviewProgram: {
      ready: missingReviewProgramScopes.length === 0,
      missingScopes: missingReviewProgramScopes,
      requiredScopes: REQUIRED_REVIEW_PROGRAM_SCOPES,
      status: missingReviewProgramScopes.includes('write_product_reviews')
        ? 'approval_required'
        : 'scope_ready',
      note: 'Shopify standard product-review syndication is a restricted program. ELEV8 should only write standard product_review metaobjects after Shopify grants write_product_reviews to the production app.',
    },
    automationParity: {
      missingScopes: missingAutomationScopes,
      requiredScopes: WORKFLOW_COMPANION_PARITY_SCOPES,
      ready: missingAutomationScopes.length === 0,
    },
    externalReviewApps: external,
  };
}

module.exports = {
  REQUIRED_REVIEW_PROGRAM_SCOPES,
  WORKFLOW_COMPANION_PARITY_SCOPES,
  getShopifyReviewPresence,
};
