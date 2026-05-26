require('dotenv').config();

const { createApp } = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { env } = require('./src/config/env');

async function start() {
  await connectDatabase();

  const app = createApp();

  app.listen(env.port, () => {
    console.log(`Nectar modular API running on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start Nectar API:', error);
  process.exit(1);
});
