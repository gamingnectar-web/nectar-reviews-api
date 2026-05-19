require('dotenv').config();

const app = require('./src/app');
const { connectDb } = require('./src/config/db');
const { env } = require('./src/config/env');

async function start() {
  await connectDb();
  app.listen(env.port, () => {
    console.log(`✅ Nectar Reviews API running on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error('❌ Failed to start Nectar Reviews API:', error);
  process.exit(1);
});
