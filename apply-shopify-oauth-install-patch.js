const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.js');

if (!fs.existsSync(serverPath)) {
  throw new Error('server.js not found');
}

let server = fs.readFileSync(serverPath, 'utf8');

if (!server.includes("const crypto = require('crypto')") && !server.includes('const crypto = require("crypto")')) {
  server = server.replace(
    /const\s+[^;\n]*require\(['"]express['"]\)[^;\n]*;?\n/,
    match => `${match}const crypto = require('crypto');\n`
  );
}

const oauthModels = `
/* -------------------------------------------------------------------------- */
/* Shopify OAuth install storage                                              */
/* -------------------------------------------------------------------------- */

const shopifyInstallationSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  accessToken: { type: String, required: true },
  scope: { type: String, default: '' },
  installedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const ShopifyInstallation =
  mongoose.models.ShopifyInstallation ||
  mongoose.model('ShopifyInstallation', shopifyInstallationSchema, 'shopify_installations');

const shopifyOAuthStateSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  state: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

const ShopifyOAuthState =
  mongoose.models.ShopifyOAuthState ||
  mongoose.model('ShopifyOAuthState', shopifyOAuthStateSchema, 'shopify_oauth_states');
`;

if (!server.includes('Shopify OAuth install storage')) {
  const helperMarker = '/* -------------------------------------------------------------------------- */\n/* Shopify helpers';
  if (!server.includes(helperMarker)) {
    throw new Error('Could not find Shopify helpers marker');
  }
  server = server.replace(helperMarker, `${oauthModels}\n${helperMarker}`);
}

const oldShopifyFetchStart = server.indexOf('async function shopifyFetch(pathname, options = {})');
if (oldShopifyFetchStart === -1) {
  throw new Error('Could not find shopifyFetch');
}

const oldShopifyFetchEnd = server.indexOf('\n}\n\nasync function syncShopifyMetafields', oldShopifyFetchStart);
if (oldShopifyFetchEnd === -1) {
  throw new Error('Could not find end of shopifyFetch');
}

const newShopifyFetch = `async function getShopifyAdminAccessToken(shopDomain) {
  const cleanShop = cleanShopDomain(shopDomain || getShopifyStoreUrl());

  if (cleanShop) {
    const installation = await ShopifyInstallation.findOne({
      shopDomain: cleanShop,
      isActive: { $ne: false }
    }).lean();

    if (installation?.accessToken) {
      return installation.accessToken;
    }
  }

  // Single-store fallback for your own dev store only.
  return (
    process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN ||
    process.env.SHOPIFY_ACCESS_TOKEN ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    ''
  );
}

async function shopifyFetch(pathname, options = {}) {
  const requestedShop = options.shopDomain || options.shop || getShopifyStoreUrl();
  const STORE_URL = cleanShopDomain(requestedShop);

  const ADMIN_ACCESS_TOKEN = await getShopifyAdminAccessToken(STORE_URL);

  if (!STORE_URL || !ADMIN_ACCESS_TOKEN) {
    throw new Error(
      'Missing Shopify Admin API credentials. Shop is not installed or no Admin API token is stored.'
    );
  }

  const fetchOptions = { ...options };
  delete fetchOptions.shopDomain;
  delete fetchOptions.shop;

  const response = await fetch(\`https://\${STORE_URL}\${pathname}\`, {
    ...fetchOptions,
    headers: {
      'X-Shopify-Access-Token': ADMIN_ACCESS_TOKEN,
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(\`Shopify request failed: \${response.status} \${text}\`);
  }

  return response.json();
}`;

server =
  server.slice(0, oldShopifyFetchStart) +
  newShopifyFetch +
  server.slice(oldShopifyFetchEnd + 3);

const oauthRoutes = `
/* -------------------------------------------------------------------------- */
/* Shopify OAuth install routes                                               */
/* -------------------------------------------------------------------------- */

function getAppBaseUrl(req) {
  return (
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    \`\${req.protocol}://\${req.get('host')}\`
  ).replace(/\\/$/, '');
}

function getShopifyScopes() {
  return (
    process.env.SHOPIFY_SCOPES ||
    'read_products,write_products,read_orders,read_discounts,write_discounts'
  );
}

function verifyShopifyOAuthHmac(query) {
  const secret = process.env.SHOPIFY_API_SECRET;
  const hmac = query.hmac;

  if (!secret || !hmac) return false;

  const message = Object.keys(query)
    .filter(key => key !== 'hmac' && key !== 'signature')
    .sort()
    .map(key => {
      const value = Array.isArray(query[key]) ? query[key].join(',') : query[key];
      return \`\${key}=\${value}\`;
    })
    .join('&');

  const digest = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch (error) {
    return false;
  }
}

app.get('/api/auth/shopify', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shop);

    if (!shopDomain || !shopDomain.endsWith('.myshopify.com')) {
      return res.status(400).send('Missing or invalid shop parameter');
    }

    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return res.status(500).send('Missing Shopify app credentials');
    }

    const state = crypto.randomBytes(24).toString('hex');

    await ShopifyOAuthState.create({
      shopDomain,
      state,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    const redirectUri = \`\${getAppBaseUrl(req)}/api/auth/shopify/callback\`;

    const authUrl = new URL(\`https://\${shopDomain}/admin/oauth/authorize\`);
    authUrl.searchParams.set('client_id', process.env.SHOPIFY_API_KEY);
    authUrl.searchParams.set('scope', getShopifyScopes());
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    return res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Shopify OAuth start failed:', error);
    return res.status(500).send('Could not start Shopify installation');
  }
});

app.get('/api/auth/shopify/callback', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shop);
    const code = req.query.code;
    const state = req.query.state;

    if (!shopDomain || !code || !state) {
      return res.status(400).send('Missing OAuth callback parameters');
    }

    if (!verifyShopifyOAuthHmac(req.query)) {
      return res.status(400).send('Invalid Shopify OAuth HMAC');
    }

    const savedState = await ShopifyOAuthState.findOneAndDelete({
      shopDomain,
      state
    });

    if (!savedState) {
      return res.status(400).send('Invalid or expired OAuth state');
    }

    const tokenResponse = await fetch(\`https://\${shopDomain}/admin/oauth/access_token\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
      })
    });

    const tokenJson = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || !tokenJson.access_token) {
      console.error('Shopify token exchange failed:', tokenJson);
      return res.status(400).send('Could not get Shopify access token');
    }

    await ShopifyInstallation.findOneAndUpdate(
      { shopDomain },
      {
        $set: {
          shopDomain,
          accessToken: tokenJson.access_token,
          scope: tokenJson.scope || '',
          installedAt: new Date(),
          updatedAt: new Date(),
          isActive: true
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const redirectPath = process.env.AFTER_AUTH_REDIRECT_PATH || '/admin.html';
    const redirectUrl = new URL(\`\${getAppBaseUrl(req)}\${redirectPath}\`);
    redirectUrl.searchParams.set('shop', shopDomain);
    redirectUrl.searchParams.set('shopDomain', shopDomain);

    return res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Shopify OAuth callback failed:', error);
    return res.status(500).send('Shopify installation failed');
  }
});

app.get('/api/auth/status', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shop || req.query.shopDomain);

    if (!shopDomain) {
      return res.status(400).json({ installed: false, error: 'shop is required' });
    }

    const installation = await ShopifyInstallation.findOne({ shopDomain }).lean();

    return res.json({
      shopDomain,
      installed: !!installation?.accessToken,
      scope: installation?.scope || ''
    });
  } catch (error) {
    return res.status(500).json({ installed: false, error: 'Could not check install status' });
  }
});
`;

if (!server.includes('Shopify OAuth install routes')) {
  const listenMatch = server.match(/\n\s*app\.listen\s*\(/);
  if (!listenMatch) {
    throw new Error('Could not find app.listen');
  }

  server = server.replace(listenMatch[0], `\n${oauthRoutes}\n${listenMatch[0]}`);
}

fs.copyFileSync(serverPath, `${serverPath}.bak-${Date.now()}`);
fs.writeFileSync(serverPath, server);

console.log('Done. Added Shopify OAuth install flow and per-shop token storage.');
