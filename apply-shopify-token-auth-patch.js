const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.js');

if (!fs.existsSync(serverPath)) {
  throw new Error('server.js not found');
}

let server = fs.readFileSync(serverPath, 'utf8');

const oldFunction = `async function shopifyFetch(pathname, options = {}) {
  const STORE_URL = getShopifyStoreUrl();
  const CLIENT_ID = process.env.SHOPIFY_API_KEY;
  const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET;

  if (!STORE_URL || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Missing Shopify credentials. Check SHOPIFY_STORE_URL, SHOPIFY_API_KEY and SHOPIFY_API_SECRET.');
  }

  const authString = Buffer.from(\`\${CLIENT_ID}:\${CLIENT_SECRET}\`).toString('base64');

  const response = await fetch(\`https://\${STORE_URL}\${pathname}\`, {
    ...options,
    headers: {
      Authorization: \`Basic \${authString}\`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(\`Shopify request failed: \${response.status} \${text}\`);
  }

  return response.json();
}`;

const newFunction = `async function shopifyFetch(pathname, options = {}) {
  const STORE_URL = getShopifyStoreUrl();

  const ADMIN_ACCESS_TOKEN =
    process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN ||
    process.env.SHOPIFY_ACCESS_TOKEN ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    '';

  if (!STORE_URL || !ADMIN_ACCESS_TOKEN) {
    throw new Error(
      'Missing Shopify Admin API credentials. Check SHOPIFY_STORE_URL and SHOPIFY_ADMIN_API_ACCESS_TOKEN.'
    );
  }

  const response = await fetch(\`https://\${STORE_URL}\${pathname}\`, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': ADMIN_ACCESS_TOKEN,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(\`Shopify request failed: \${response.status} \${text}\`);
  }

  return response.json();
}`;

if (!server.includes(oldFunction)) {
  console.error('Could not find the old shopifyFetch function exactly.');
  console.error('Showing current shopifyFetch area:');
  const start = server.indexOf('async function shopifyFetch');
  console.error(server.slice(start, start + 1200));
  process.exit(1);
}

fs.copyFileSync(serverPath, `${serverPath}.bak-${Date.now()}`);
server = server.replace(oldFunction, newFunction);
fs.writeFileSync(serverPath, server);

console.log('Done. Shopify Admin API calls now use X-Shopify-Access-Token.');
