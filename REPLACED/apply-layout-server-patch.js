/*
  Nectar Reviews — Support Requests Server Patch
  Run from repo root:
    node apply-layout-server-patch.js

  Adds:
  - SupportRequest Mongo model
  - POST /api/support-requests
  - GET /api/admin/support-requests
*/

const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('server.js not found. Run this from your repo root.');
  process.exit(1);
}

let server = fs.readFileSync(serverPath, 'utf8');

const modelCode = `
const supportRequestSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  orderId: { type: String, default: '' },
  customerName: { type: String, default: '' },
  email: { type: String, default: '' },
  reason: { type: String, default: '' },
  message: { type: String, default: '' },
  products: { type: Array, default: [] },
  status: { type: String, enum: ['new', 'open', 'closed'], default: 'new' },
  createdAt: { type: Date, default: Date.now }
});

supportRequestSchema.index({ shopDomain: 1, createdAt: -1 });

const SupportRequest =
  mongoose.models.SupportRequest ||
  mongoose.model('SupportRequest', supportRequestSchema, 'support_requests');
`;

if (!server.includes('supportRequestSchema')) {
  const marker = "const EmailProviderSettings =";
  if (server.includes(marker)) {
    server = server.replace(marker, `${modelCode}\n${marker}`);
  } else {
    const fallbackMarker = "/* -------------------------------------------------------------------------- */\n/* Generic helpers";
    server = server.replace(fallbackMarker, `${modelCode}\n${fallbackMarker}`);
  }
  console.log('✓ Added SupportRequest model');
} else {
  console.log('✓ SupportRequest model already exists');
}

const routesCode = `
app.post('/api/support-requests', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.body.shopDomain);

    if (!shopDomain) {
      return res.status(400).json({ error: 'shopDomain is required.' });
    }

    if (!req.body.message || String(req.body.message).trim().length < 2) {
      return res.status(400).json({ error: 'Support message is required.' });
    }

    const request = await SupportRequest.create({
      shopDomain,
      orderId: String(req.body.orderId || ''),
      customerName: String(req.body.customerName || ''),
      email: String(req.body.email || '').toLowerCase(),
      reason: String(req.body.reason || 'Other'),
      message: String(req.body.message || ''),
      products: Array.isArray(req.body.products) ? req.body.products : []
    });

    return res.status(201).json({ ok: true, request });
  } catch (error) {
    console.error('Support request failed:', error);
    return res.status(500).json({ error: 'Failed to create support request.' });
  }
});

app.get('/api/admin/support-requests', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain);

    if (!shopDomain) {
      return res.status(400).json({ error: 'shopDomain is required.' });
    }

    const requests = await SupportRequest.find({ shopDomain })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json(requests);
  } catch (error) {
    console.error('Support requests load failed:', error);
    return res.status(500).json({ error: 'Failed to load support requests.' });
  }
});
`;

if (!server.includes("/api/support-requests")) {
  const routeMarker = "/* -------------------------------------------------------------------------- */\n/* Campaign tracking";
  if (server.includes(routeMarker)) {
    server = server.replace(routeMarker, `${routesCode}\n${routeMarker}`);
  } else {
    server = server.replace("/* -------------------------------------------------------------------------- */\n/* Static admin", `${routesCode}\n/* -------------------------------------------------------------------------- */\n/* Static admin`);
  }
  console.log('✓ Added support request routes');
} else {
  console.log('✓ Support request routes already exist');
}

fs.writeFileSync(serverPath, server, 'utf8');

console.log(`
Done.

Now run:
  node -c server.js
  rm -rf node_modules && git add server.js public/admin-messaging-campaigns.js blocks/magic-link-review-page-enhanced.liquid && git commit -m "Add enhanced messaging layout and support requests" && git push origin main
`);
