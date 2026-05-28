require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');
const { env } = require('./src/config/env');
const { connectCoreDb, connectLoyaltyDb } = require('./src/config/db');

async function start() {
  try {
    await connectCoreDb();
    await connectLoyaltyDb();
    app.listen(env.port, () => {
      console.log(`Nectar Reviews API running on port ${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
});

start();
