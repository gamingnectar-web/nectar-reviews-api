require('dotenv').config();
const mongoose = require('mongoose');
const { connectDb } = require('../src/config/db');
const LegacySubscription = require('../src/modules/notifications/models/NotificationSubscription');
const LegacyEvent = require('../src/modules/notifications/models/NotificationEvent');
const { RestockSubscription, NotificationEvent } = require('../src/modules/notifications/notifications.models');
const { anonymousRef, sealText, sealJson, scrubMeta, redactText } = require('../src/modules/notifications/services/privacyVault');

const APPLY = process.argv.includes('--apply');

function unsetIfPresent(unset, doc, key) { if (Object.prototype.hasOwnProperty.call(doc, key)) unset[key] = ''; }

async function migrateLegacySubscriptions() {
  const collection = LegacySubscription.collection;
  let seen = 0, changed = 0;
  const cursor = collection.find({});
  for await (const doc of cursor) {
    seen += 1;
    const set = {}, unset = {};
    if (!doc.customerRefHash && doc.customerId) set.customerRefHash = anonymousRef(doc.shopDomain, 'customer', doc.customerId);
    if (!doc.emailEncrypted && doc.email) set.emailEncrypted = sealText(doc.email);
    if (!doc.resourceKeyHash && doc.resourceKey) set.resourceKeyHash = anonymousRef(doc.shopDomain, 'resource', doc.resourceKey);
    if (!doc.orderIdEncrypted && doc.orderId) set.orderIdEncrypted = sealText(doc.orderId);
    if (!doc.orderNameEncrypted && doc.orderName) set.orderNameEncrypted = sealText(doc.orderName);
    if (!doc.trackingNumberEncrypted && doc.trackingNumber) set.trackingNumberEncrypted = sealText(doc.trackingNumber);
    if (!doc.stateEncrypted && doc.state !== undefined) set.stateEncrypted = sealJson(doc.state || {});
    ['customerId','email','resourceKey','orderId','orderName','trackingNumber','state'].forEach((key)=>unsetIfPresent(unset,doc,key));
    if (Object.keys(set).length || Object.keys(unset).length) {
      changed += 1;
      if (APPLY) await collection.updateOne({ _id: doc._id }, { ...(Object.keys(set).length ? {$set:set} : {}), ...(Object.keys(unset).length ? {$unset:unset} : {}) });
    }
  }
  return { seen, changed };
}

async function migrateLegacyEvents() {
  const collection = LegacyEvent.collection;
  let seen = 0, changed = 0;
  const cursor = collection.find({});
  for await (const doc of cursor) {
    seen += 1;
    const set = {}, unset = {};
    if (!doc.customerRefHash && doc.customerId) set.customerRefHash = anonymousRef(doc.shopDomain, 'customer', doc.customerId);
    if (!doc.emailEncrypted && doc.email) set.emailEncrypted = sealText(doc.email);
    if (!doc.urlEncrypted && doc.url) set.urlEncrypted = sealText(doc.url);
    if (!doc.dataEncrypted && doc.data !== undefined) set.dataEncrypted = sealJson(doc.data || {});
    if (doc.title) set.title = redactText(doc.title);
    if (doc.body) set.body = redactText(doc.body);
    ['customerId','email','url','data'].forEach((key)=>unsetIfPresent(unset,doc,key));
    if (Object.keys(set).length || Object.keys(unset).length) {
      changed += 1;
      if (APPLY) await collection.updateOne({ _id: doc._id }, { ...(Object.keys(set).length ? {$set:set} : {}), ...(Object.keys(unset).length ? {$unset:unset} : {}) });
    }
  }
  return { seen, changed };
}

async function migrateRestockSubscriptions() {
  const collection = RestockSubscription.collection;
  const count = await collection.countDocuments({ customerId: { $exists: true } });
  if (APPLY && count) await collection.updateMany({ customerId: { $exists: true } }, { $unset: { customerId: '' } });
  return { seen: await collection.countDocuments({}), changed: count };
}

async function scrubNotificationEvents() {
  const collection = NotificationEvent.collection;
  let seen = 0, changed = 0;
  const cursor = collection.find({});
  for await (const doc of cursor) {
    seen += 1;
    const set = {};
    if (doc.detail) set.detail = redactText(doc.detail);
    if (doc.meta && typeof doc.meta === 'object') set.meta = scrubMeta(doc.meta, doc.shopDomain);
    const before = JSON.stringify({ detail: doc.detail || '', meta: doc.meta || {} });
    const after = JSON.stringify({ detail: set.detail ?? doc.detail ?? '', meta: set.meta ?? doc.meta ?? {} });
    if (before !== after) {
      changed += 1;
      if (APPLY) await collection.updateOne({ _id: doc._id }, { $set: set });
    }
  }
  return { seen, changed };
}

async function main() {
  if (!process.env.EMAIL_CREDENTIAL_SECRET || String(process.env.EMAIL_CREDENTIAL_SECRET).length < 16) {
    throw new Error('EMAIL_CREDENTIAL_SECRET must be set before privacy migration.');
  }
  await connectDb();
  const results = {
    legacySubscriptions: await migrateLegacySubscriptions(),
    legacyEvents: await migrateLegacyEvents(),
    restockSubscriptions: await migrateRestockSubscriptions(),
    notificationEvents: await scrubNotificationEvents(),
  };
  console.log(JSON.stringify({ mode: APPLY ? 'APPLY' : 'DRY_RUN', ...results }, null, 2));
  if (!APPLY) console.log('Dry run only. Re-run with --apply to encrypt/hash and remove legacy plaintext fields.');
  await mongoose.disconnect();
}
main().catch(async (error)=>{console.error('Notification privacy migration failed:',error.message);try{await mongoose.disconnect()}catch(_){}process.exit(1)});
