require('dotenv').config();

const app = require('./src/app');
const { connectDb } = require('./src/config/db');
const { env } = require('./src/config/env');

async function start() {
  await connectDb();
  app.listen(env.port, () => {
    console.log(`✅ Reviews Platform API running on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error('❌ Failed to start Reviews Platform API:', error);
  process.exit(1);
});
