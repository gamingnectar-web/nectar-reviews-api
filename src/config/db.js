const mongoose = require('mongoose');
const { env } = require('./env');

let loyaltyConnection = null;

async function connectDb() {
  if (!env.mongoUri) {
    console.warn('⚠️ Missing CORE_DB_URI / MONGODB_URI / MONGO_URI. API will start, but database routes will fail.');
    return null;
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log('✅ DB Connected');

  if (env.loyaltyMongoUri) {
    loyaltyConnection = await mongoose.createConnection(env.loyaltyMongoUri, {
      serverSelectionTimeoutMS: 15000,
    }).asPromise();
    console.log('✅ Loyalty DB Connected');
  } else {
    console.warn('⚠️ LOYALTY_DB_URI not set. Loyalty will fall back to the core DB for development only.');
  }

  return mongoose.connection;
}

function getLoyaltyConnection() {
  return loyaltyConnection || mongoose.connection;
}

module.exports = { connectDb, getLoyaltyConnection };
