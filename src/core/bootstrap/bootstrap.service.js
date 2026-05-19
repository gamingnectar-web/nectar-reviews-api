const { config } = require('../config');
const { getDomainConnection, getAuditConnection } = require('../database');

function seconds(days) {
  return 60 * 60 * 24 * days;
}

function collectionSpecs() {
  return {
    core: {
      connection: getDomainConnection('core'),
      collections: {
        shops: [
          [{ shopDomain: 1 }, { unique: true }]
        ],
        shop_modules: [
          [{ shopDomain: 1 }, { unique: true }]
        ],
        shopify_installations: [
          [{ shopDomain: 1 }, { unique: true }]
        ],
        shopify_oauth_states: [
          [{ state: 1 }, { unique: true }],
          [{ shopDomain: 1 }],
          [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]
        ],
        webhook_receipts: [
          [{ shopDomain: 1, topic: 1, webhookId: 1 }, { unique: true, sparse: true }],
          [{ createdAt: 1 }, { expireAfterSeconds: seconds(90) }]
        ],
        bootstrap_runs: [
          [{ createdAt: -1 }]
        ]
      }
    },
    reviews: {
      connection: getDomainConnection('reviews'),
      collections: {
        reviews: [
          [{ shopDomain: 1, itemId: 1, status: 1, isDeleted: 1, createdAt: -1 }],
          [{ shopDomain: 1, status: 1, createdAt: -1 }],
          [{ shopDomain: 1, customerKey: 1, orderKey: 1 }],
          [{ shopDomain: 1, requestToken: 1 }],
          [{ deletedAt: 1 }, { expireAfterSeconds: seconds(28), sparse: true }]
        ],
        review_request_links: [
          [{ token: 1 }, { unique: true }],
          [{ shopDomain: 1, customerKey: 1, itemId: 1 }],
          [{ shopDomain: 1, usedAt: 1 }],
          [{ expiresAt: 1 }, { expireAfterSeconds: seconds(1) }]
        ],
        settings: [
          [{ shopDomain: 1 }, { unique: true }]
        ],
        review_widget_settings: [
          [{ shopDomain: 1 }, { unique: true }]
        ]
      }
    },
    discounts: {
      connection: getDomainConnection('discounts'),
      collections: {
        discount_settings: [
          [{ shopDomain: 1 }, { unique: true }]
        ],
        review_rewards: [
          [{ shopDomain: 1, reviewId: 1 }, { unique: true }],
          [{ shopDomain: 1, customerKey: 1, createdAt: -1 }],
          [{ shopDomain: 1, discountCodeHash: 1 }, { unique: true }]
        ]
      }
    },
    loyalty: {
      connection: getDomainConnection('loyalty'),
      collections: {
        loyalty_settings: [
          [{ shopDomain: 1 }, { unique: true }]
        ],
        loyalty_accounts: [
          [{ shopDomain: 1, customerKey: 1 }, { unique: true }],
          [{ shopDomain: 1, status: 1 }],
          [{ shopDomain: 1, updatedAt: -1 }]
        ],
        loyalty_rules: [
          [{ shopDomain: 1, ruleType: 1, trigger: 1, enabled: 1, priority: 1 }],
          [{ shopDomain: 1, name: 1 }]
        ],
        loyalty_transactions: [
          [{ shopDomain: 1, dedupeKey: 1 }, { unique: true, sparse: true }],
          [{ shopDomain: 1, status: 1, eligibleAt: 1 }],
          [{ shopDomain: 1, customerKey: 1, createdAt: -1 }],
          [{ shopDomain: 1, sourceRefHash: 1, status: 1 }],
          [{ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true }]
        ],
        loyalty_redemptions: [
          [{ shopDomain: 1, customerKey: 1, createdAt: -1 }],
          [{ shopDomain: 1, discountCodeHash: 1 }, { unique: true }],
          [{ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true }]
        ],
        loyalty_scheduled_jobs: [
          [{ shopDomain: 1, jobType: 1, runAt: 1, status: 1 }],
          [{ dedupeKey: 1 }, { unique: true, sparse: true }]
        ]
      }
    },
    messaging: {
      connection: getDomainConnection('messaging'),
      collections: {
        email_provider_settings: [
          [{ shopDomain: 1 }, { unique: true }]
        ],
        campaign_events: [
          [{ shopDomain: 1, campaign: 1, eventType: 1, createdAt: -1 }],
          [{ shopDomain: 1, eventType: 1, createdAt: -1 }],
          [{ createdAt: 1 }, { expireAfterSeconds: seconds(180) }]
        ],
        message_templates: [
          [{ shopDomain: 1, templateKey: 1 }, { unique: true }]
        ],
        message_jobs: [
          [{ shopDomain: 1, status: 1, runAt: 1 }],
          [{ dedupeKey: 1 }, { unique: true, sparse: true }]
        ],
        message_suppressions: [
          [{ shopDomain: 1, recipientHash: 1 }, { unique: true }]
        ]
      }
    },
    audit: {
      connection: getAuditConnection(),
      collections: {
        audit_events: [
          [{ shopDomain: 1, createdAt: -1 }],
          [{ module: 1, eventType: 1, createdAt: -1 }],
          [{ createdAt: 1 }, { expireAfterSeconds: seconds(365) }]
        ],
        security_events: [
          [{ shopDomain: 1, createdAt: -1 }],
          [{ severity: 1, createdAt: -1 }],
          [{ createdAt: 1 }, { expireAfterSeconds: seconds(730) }]
        ],
        webhook_events: [
          [{ shopDomain: 1, topic: 1, createdAt: -1 }],
          [{ webhookId: 1 }, { unique: true, sparse: true }],
          [{ createdAt: 1 }, { expireAfterSeconds: seconds(90) }]
        ],
        job_run_events: [
          [{ jobType: 1, createdAt: -1 }],
          [{ createdAt: 1 }, { expireAfterSeconds: seconds(180) }]
        ]
      }
    }
  };
}

async function ensureCollection(connection, collectionName, messages) {
  const existing = await connection.db.listCollections({ name: collectionName }).toArray();
  if (!existing.length) {
    await connection.db.createCollection(collectionName);
    messages.push(`Created collection: ${connection.name}.${collectionName}`);
  } else {
    messages.push(`Collection exists: ${connection.name}.${collectionName}`);
  }
  return connection.db.collection(collectionName);
}

async function ensureIndex(collection, keys, options, messages) {
  try {
    await collection.createIndex(keys, options || {});
    messages.push(`Index ready: ${collection.namespace} ${JSON.stringify(keys)}`);
  } catch (error) {
    messages.push(`Index skipped/error: ${collection.namespace} ${JSON.stringify(keys)} - ${error.message}`);
  }
}

async function seedDefaultLoyaltyRules(messages) {
  const connection = getDomainConnection('loyalty');
  const collection = connection.db.collection('loyalty_rules');
  const now = new Date();
  const defaults = [
    {
      filter: { shopDomain: '__default__', name: 'Standard order earning' },
      doc: {
        shopDomain: '__default__', ruleType: 'earn', trigger: 'order_paid', name: 'Standard order earning', description: 'Earn Nectar Drops on eligible purchases.', enabled: true, priority: 100,
        conditions: { minimumSpend: 0, excludedProductIds: [], excludedCollectionIds: [] },
        reward: { mode: 'points_per_currency', pointsPerCurrency: 5 },
        delay: { mode: 'after_fulfillment', days: 14 },
        limits: { maxUsesPerCustomer: 0, maxPointsPerEvent: 5000 },
        createdBy: 'bootstrap', createdAt: now, updatedAt: now
      }
    },
    {
      filter: { shopDomain: '__default__', name: 'Approved review reward' },
      doc: {
        shopDomain: '__default__', ruleType: 'earn', trigger: 'review_accepted', name: 'Approved review reward', description: 'Earn Nectar Drops when an approved review is posted.', enabled: true, priority: 200,
        conditions: {}, reward: { mode: 'fixed_points', points: 50 }, delay: { mode: 'immediate', days: 0 }, limits: { maxUsesPerCustomer: 50, maxPointsPerEvent: 50 },
        createdBy: 'bootstrap', createdAt: now, updatedAt: now
      }
    },
    {
      filter: { shopDomain: '__default__', name: '£5 off voucher' },
      doc: {
        shopDomain: '__default__', ruleType: 'redeem', trigger: 'customer_redeem', name: '£5 off voucher', description: 'Redeem Nectar Drops for a one-use discount code.', enabled: true, priority: 100,
        conditions: { minimumSpend: 25 }, reward: { discountType: 'fixed_amount', amount: 5, currency: 'GBP' }, delay: { mode: 'immediate', days: 0 }, limits: {}, pointsCost: 500, expiryDays: 30, usage: { singleUseCode: true },
        createdBy: 'bootstrap', createdAt: now, updatedAt: now
      }
    }
  ];

  for (const item of defaults) {
    await collection.updateOne(item.filter, { $setOnInsert: item.doc }, { upsert: true });
    messages.push(`Default loyalty rule ready: ${item.doc.name}`);
  }
}

async function runDatabaseBootstrap({ actor = 'setup-page' } = {}) {
  if (config.security.disableDatabaseBootstrap) {
    const error = new Error('Database bootstrap is disabled by DISABLE_DATABASE_BOOTSTRAP=true.');
    error.statusCode = 403;
    throw error;
  }

  const messages = [];
  const specs = collectionSpecs();

  for (const [domain, spec] of Object.entries(specs)) {
    messages.push(`--- ${domain.toUpperCase()} DATABASE: ${spec.connection.name} ---`);
    for (const [collectionName, indexes] of Object.entries(spec.collections)) {
      const collection = await ensureCollection(spec.connection, collectionName, messages);
      for (const [keys, options] of indexes) {
        await ensureIndex(collection, keys, options, messages);
      }
    }
  }

  await seedDefaultLoyaltyRules(messages);

  const coreConnection = getDomainConnection('core');
  await coreConnection.db.collection('bootstrap_runs').insertOne({
    actor,
    app: 'nectar-reviews-api',
    version: '3.1.0',
    createdAt: new Date(),
    databases: config.databases
  });

  return {
    ok: true,
    version: '3.1.0',
    databases: {
      core: getDomainConnection('core').name,
      reviews: getDomainConnection('reviews').name,
      discounts: getDomainConnection('discounts').name,
      loyalty: getDomainConnection('loyalty').name,
      messaging: getDomainConnection('messaging').name,
      audit: getAuditConnection().name
    },
    messages
  };
}

module.exports = { runDatabaseBootstrap };
