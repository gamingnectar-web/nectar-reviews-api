const mongoose = require('mongoose');
const { config } = require('./config');

let connected = false;
let auditConnection = null;

async function connectDatabase() {
  if (connected || mongoose.connection.readyState === 1) {
    connected = true;
    return mongoose.connection;
  }

  if (!config.mongoUri) {
    console.warn('⚠️ Missing MONGODB_URI. The API will start, but DB-backed routes will fail until MongoDB is configured.');
    return mongoose.connection;
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { autoIndex: true });
  connected = true;
  console.log('✅ MongoDB connected');

  if (config.auditMongoUri) {
    auditConnection = await mongoose.createConnection(config.auditMongoUri, { autoIndex: true }).asPromise();
    console.log('✅ Audit MongoDB connected');
  } else {
    auditConnection = mongoose.connection.useDb(config.auditDbName, { useCache: true });
    console.log(`✅ Audit database selected: ${config.auditDbName}`);
  }

  return mongoose.connection;
}

function getAuditConnection() {
  return auditConnection || mongoose.connection.useDb(config.auditDbName, { useCache: true });
}

module.exports = { connectDatabase, getAuditConnection };
