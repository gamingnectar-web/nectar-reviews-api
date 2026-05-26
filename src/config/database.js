const mongoose = require('mongoose');
const { env } = require('./env');

async function connectDatabase() {
  if (!env.coreDbUri) {
    console.warn('CORE_DB_URI is not set. Running with in-memory fallbacks for settings only. Persistent product data requires MongoDB.');
    return null;
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(env.coreDbUri, {
    serverSelectionTimeoutMS: 10000
  });

  console.log('Connected to MongoDB');
  return mongoose.connection;
}

function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, isDatabaseConnected };
