const mongoose = require('mongoose');
const { env } = require('./env');

async function connectDb() {
  if (!env.mongoUri) {
    console.warn('⚠️ Missing MONGODB_URI / MONGO_URI. API will start, but database routes will fail.');
    return null;
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log('✅ DB Connected');
  return mongoose.connection;
}

module.exports = { connectDb };
