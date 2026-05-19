require('dotenv').config();
const mongoose = require('mongoose');
const { config } = require('../src/core/config');

async function run() {
  if (!config.mongoUri) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(config.mongoUri);
  const db = mongoose.connection.db;

  const results = {};

  results.reviews = await db.collection('reviews').updateMany({}, {
    $set: { email: '', userId: '', customerName: '' },
    $unset: { phone: '', address: '' }
  });

  results.reviewRewards = await db.collection('review_rewards').updateMany({ discountCode: { $exists: true } }, {
    $unset: { discountCode: '', email: '' }
  });

  results.campaignEvents = await db.collection('campaign_events').updateMany({}, {
    $unset: { userAgent: '', url: '', token: '', email: '', recipient: '' }
  });

  results.reviewRequestLinks = await db.collection('review_request_links').updateMany({}, {
    $unset: { email: '', recipient: '', customerEmail: '', customerName: '' }
  });

  console.log(JSON.stringify(results, null, 2));
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
