const mongoose = require('mongoose');
const { env } = require('./env');
let loyaltyConnection = null;

async function connectCoreDb() {
  if (!env.mongoUri) {
    console.warn('CORE_DB_URI/MONGODB_URI is not configured. Mongo-backed routes will fail until it is set.');
    return null;
  }
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { autoIndex: true });
  console.log('Connected core MongoDB:', mongoose.connection.name);
  return mongoose.connection;
}

async function connectLoyaltyDb() {
  if (!env.loyaltyMongoUri) {
    loyaltyConnection = mongoose.connection;
    return loyaltyConnection;
  }
  if (loyaltyConnection && loyaltyConnection.readyState === 1) return loyaltyConnection;
  loyaltyConnection = await mongoose.createConnection(env.loyaltyMongoUri, { autoIndex: true }).asPromise();
  console.log('Connected loyalty MongoDB:', loyaltyConnection.name);
  return loyaltyConnection;
}

function getLoyaltyConnection() {
  return loyaltyConnection || mongoose.connection;
}

module.exports = { connectCoreDb, connectLoyaltyDb, getLoyaltyConnection };
