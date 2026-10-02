require('dotenv').config();
const mongoose = require('mongoose');
const { connectDb } = require('../src/config/db');
const LegacySubscription = require('../src/modules/notifications/models/NotificationSubscription');
const LegacyEvent = require('../src/modules/notifications/models/NotificationEvent');
const { RestockSubscription, NotificationEvent } = require('../src/modules/notifications/notifications.models');

async function countAny(collection, fields) {
  return collection.countDocuments({ $or: fields.map((field)=>({ [field]: { $exists:true } })) });
}
async function main(){
  await connectDb();
  const checks = {
    legacySubscriptionPlaintext: await countAny(LegacySubscription.collection,['customerId','email','resourceKey','orderId','orderName','trackingNumber','state']),
    legacyEventPlaintext: await countAny(LegacyEvent.collection,['customerId','email','url','data']),
    restockCustomerIdPlaintext: await countAny(RestockSubscription.collection,['customerId']),
    notificationEventCustomerIdMeta: await NotificationEvent.collection.countDocuments({ $or:[{'meta.customerId':{$exists:true}},{'meta.customer_id':{$exists:true}}] }),
  };
  console.log(JSON.stringify(checks,null,2));
  const failures=Object.values(checks).reduce((n,v)=>n+Number(v||0),0);
  await mongoose.disconnect();
  if(failures){console.error(`Privacy audit FAILED: ${failures} notification records still contain forbidden plaintext fields.`);process.exit(2)}
  console.log('Privacy audit passed: no forbidden notification identity fields remain in plaintext.');
}
main().catch(async(error)=>{console.error('Notification privacy audit failed:',error.message);try{await mongoose.disconnect()}catch(_){}process.exit(1)});
