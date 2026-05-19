require('dotenv').config();

const { createApp } = require('./src/core/app');
const { connectDatabase } = require('./src/core/database');
const { config } = require('./src/core/config');

async function start() {
  await connectDatabase();
  const app = createApp();

  app.listen(config.port, () => {
    console.log(`✅ Nectar Reviews API running on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error('❌ Failed to start Nectar Reviews API:', error);
  process.exit(1);
});
