const mongoose = require('mongoose');
const { config } = require('./config');

let connected = false;
let auditConnection = null;

const domainConnectionCache = new Map();

function getDomainDbName(domain) {
  const names = config.databases || {};
  return names[domain] || names.core || 'nectar_core';
}

function getDomainConnection(domain = 'core') {
  if (domain === 'audit') {
    return getAuditConnection();
  }

  if (domainConnectionCache.has(domain)) {
    return domainConnectionCache.get(domain);
  }

  const dbName = getDomainDbName(domain);
  const connection = mongoose.connection.useDb(dbName, { useCache: true });
  domainConnectionCache.set(domain, connection);
  return connection;
}

function modelFromConnection(domain, modelName, schema, collectionName) {
  const connection = getDomainConnection(domain);
  return connection.models[modelName] || connection.model(modelName, schema, collectionName);
}

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

  Object.entries(config.databases || {}).forEach(([domain, name]) => {
    if (domain !== 'audit') {
      getDomainConnection(domain);
      console.log(`✅ ${domain} database selected: ${name}`);
    }
  });

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

module.exports = {
  connectDatabase,
  getAuditConnection,
  getDomainConnection,
  getDomainDbName,
  modelFromConnection
};
