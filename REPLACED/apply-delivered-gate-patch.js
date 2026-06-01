/*
  Nectar Reviews — Delivered Tag Gate Patch
  Run from repo root:
    node apply-delivered-gate-patch.js

  This patches:
  - server.js
  - public/admin-messaging-campaigns.js, if present

  Default delivery gate:
  - required order tag: delivered
  - review-page order loading is blocked until the Shopify order has that tag
*/

const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

function replaceOnce(content, find, replace, label) {
  if (content.includes(replace.trim().slice(0, 80))) {
    console.log(`✓ Already patched: ${label}`);
    return content;
  }

  if (!content.includes(find)) {
    console.warn(`⚠ Could not find target for: ${label}`);
    return content;
  }

  console.log(`✓ Patched: ${label}`);
  return content.replace(find, replace);
}

function insertBefore(content, marker, insertion, label, alreadyToken) {
  if (content.includes(alreadyToken || insertion.trim().slice(0, 80))) {
    console.log(`✓ Already patched: ${label}`);
    return content;
  }

  if (!content.includes(marker)) {
    console.warn(`⚠ Could not find marker for: ${label}`);
    return content;
  }

  console.log(`✓ Inserted: ${label}`);
  return content.replace(marker, `${insertion}\n${marker}`);
}

function patchServer() {
  const serverFile = path.join(process.cwd(), 'server.js');

  if (!fs.existsSync(serverFile)) {
    console.error('server.js not found. Run this from your repo root.');
    process.exit(1);
  }

  let server = read(serverFile);

  // 1. Settings schema delivery gate.
  if (!server.includes('deliveryGate:')) {
    server = server.replace(
      `  emailsSentTotal: { type: Number, default: 0 },

  autoApproveEnabled:`,
      `  emailsSentTotal: { type: Number, default: 0 },

  deliveryGate: {
    enabled: { type: Boolean, default: true },
    requiredOrderTag: { type: String, default: 'delivered' },
    blockReviewPageUntilDelivered: { type: Boolean, default: true }
  },

  autoApproveEnabled:`
    );
    console.log('✓ Added deliveryGate to Settings schema');
  } else {
    console.log('✓ deliveryGate already exists in Settings schema');
  }

  // 2. Helper functions.
  const deliveryHelpers = `
function splitShopifyTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag || '').trim()).filter(Boolean);
  }

  return String(tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function orderHasRequiredDeliveryTag(order, requiredTag = 'delivered') {
  const target = String(requiredTag || 'delivered').trim().toLowerCase();

  if (!target) return true;

  const orderTags = splitShopifyTags(order?.tags).map((tag) => tag.toLowerCase());
  return orderTags.includes(target);
}

async function getDeliveryGate(shopDomain) {
  const settings = await Settings.findOne({ shopDomain }).lean();
  const gate = settings?.deliveryGate || {};

  return {
    enabled: gate.enabled !== false,
    requiredOrderTag: String(gate.requiredOrderTag || 'delivered').trim() || 'delivered',
    blockReviewPageUntilDelivered: gate.blockReviewPageUntilDelivered !== false
  };
}

async function checkOrderDeliveryGate(shopDomain, order) {
  const gate = await getDeliveryGate(shopDomain);

  if (!gate.enabled) {
    return {
      delivered: true,
      gate,
      note: 'Delivery gate is disabled.'
    };
  }

  const delivered = orderHasRequiredDeliveryTag(order, gate.requiredOrderTag);

  return {
    delivered,
    gate,
    note: delivered
      ? \`Order has required delivery tag "\${gate.requiredOrderTag}".\`
      : \`Order must have the "\${gate.requiredOrderTag}" tag before review links are allowed.\`
  };
}
`;

  server = insertBefore(
    server,
    'function orderContainsProduct(order, productId) {',
    deliveryHelpers,
    'delivery helper functions',
    'function splitShopifyTags'
  );

  // 3. Function signatures.
  server = server.replace(
    'async function verifyShopifyOrder(orderId, email, productId) {',
    'async function verifyShopifyOrder(orderId, email, productId, shopDomain = \'\') {'
  );
  server = server.replace(
    'async function verifyCustomerBoughtProduct(email, productId) {',
    'async function verifyCustomerBoughtProduct(email, productId, shopDomain = \'\') {'
  );
  server = server.replace(
    'async function resolveReviewVerification({ orderId, email, itemId }) {',
    'async function resolveReviewVerification({ orderId, email, itemId, shopDomain = \'\' }) {'
  );

  // 4. verifyShopifyOrder delivery gate.
  if (!server.includes('Verified by Shopify order, email, and delivery tag')) {
    const find = `    if (!order) return { verified: false, note: 'Order number not found.' };
    if (!orderEmailMatches(order, email)) return { verified: false, note: 'Order was placed under a different email.' };
    if (!orderContainsProduct(order, productId)) return { verified: false, note: 'Product was not found in this order.' };

    return { verified: true, note: 'Verified by Shopify order and email.' };`;

    const replace = `    if (!order) return { verified: false, note: 'Order number not found.' };
    if (!orderEmailMatches(order, email)) return { verified: false, note: 'Order was placed under a different email.' };
    if (!orderContainsProduct(order, productId)) return { verified: false, note: 'Product was not found in this order.' };

    if (shopDomain) {
      const deliveryCheck = await checkOrderDeliveryGate(shopDomain, order);
      if (!deliveryCheck.delivered) {
        return {
          verified: false,
          note: deliveryCheck.note,
          delivered: false,
          requiredOrderTag: deliveryCheck.gate.requiredOrderTag
        };
      }
    }

    return { verified: true, note: 'Verified by Shopify order, email, and delivery tag.', delivered: true };`;

    server = replaceOnce(server, find, replace, 'verifyShopifyOrder delivery gate');
  }

  // 5. verifyCustomerBoughtProduct delivery gate.
  if (!server.includes('No delivered matching Shopify order found')) {
    const customerRegex = /const data = await shopifyFetch\(`\/admin\/api\/2024-01\/orders\.json\?email=\$\{encodeURIComponent\(email\)\}&status=any&limit=250`\);\s*const order = data\.orders\?\.find\(\(candidate\) => orderEmailMatches\(candidate, email\) && orderContainsProduct\(candidate, productId\)\);\s*if \(!order\)(?: \{)?\s*(?:return \{ verified: false, note: 'No matching Shopify order found for this customer and product\.' \};\s*(?:\})?)\s*return \{ verified: true, note: `Verified by customer purchase history \(\$\{order\.name \|\| 'order'\}\)\.` \};/s;

    const customerReplace = `const data = await shopifyFetch(\`/admin/api/2024-01/orders.json?email=\${encodeURIComponent(email)}&status=any&limit=250\`);

    let matchingOrders = (data.orders || [])
      .filter((candidate) => orderEmailMatches(candidate, email) && orderContainsProduct(candidate, productId));

    if (shopDomain) {
      const gate = await getDeliveryGate(shopDomain);
      if (gate.enabled) {
        matchingOrders = matchingOrders.filter((candidate) => orderHasRequiredDeliveryTag(candidate, gate.requiredOrderTag));
      }
    }

    const order = matchingOrders[0];

    if (!order) return { verified: false, note: 'No delivered matching Shopify order found for this customer and product.' };

    return { verified: true, note: \`Verified by delivered customer purchase history (\${order.name || 'order'}).\`, delivered: true };`;

    if (customerRegex.test(server)) {
      server = server.replace(customerRegex, customerReplace);
      console.log('✓ Patched verifyCustomerBoughtProduct delivery gate');
    } else {
      console.warn('⚠ Could not safely patch verifyCustomerBoughtProduct. Check README for manual patch.');
    }
  }

  // 6. Pass shopDomain through resolveReviewVerification.
  server = server.replace(
    'return verifyShopifyOrder(orderId, email, itemId);',
    'return verifyShopifyOrder(orderId, email, itemId, shopDomain);'
  );
  server = server.replace(
    'return verifyCustomerBoughtProduct(email, itemId);',
    'return verifyCustomerBoughtProduct(email, itemId, shopDomain);'
  );

  server = server.replace(
`      const check = await resolveReviewVerification({
        orderId: review.orderId,
        email: review.email,
        itemId: review.itemId
      });`,
`      const check = await resolveReviewVerification({
        orderId: review.orderId,
        email: review.email,
        itemId: review.itemId,
        shopDomain: review.shopDomain
      });`
  );

  server = server.replace(
`      const checkResult = await resolveReviewVerification({
        orderId: req.body.orderId,
        email,
        itemId: req.body.itemId
      });`,
`      const checkResult = await resolveReviewVerification({
        orderId: req.body.orderId,
        email,
        itemId: req.body.itemId,
        shopDomain
      });`
  );

  server = server.replace(
`        const checkResult = await resolveReviewVerification({
          orderId,
          email,
          itemId: review.itemId
        });`,
`        const checkResult = await resolveReviewVerification({
          orderId,
          email,
          itemId: review.itemId,
          shopDomain
        });`
  );

  // 7. Magic link review-page block.
  if (!server.includes("error: 'Order not delivered yet'")) {
    const find = `    if (!order || !orderEmailMatches(order, email)) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const products = await Promise.all((order.line_items || []).map(async (item) => {`;

    const replace = `    if (!order || !orderEmailMatches(order, email)) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const deliveryCheck = await checkOrderDeliveryGate(shopDomain, order);
    if (deliveryCheck.gate.enabled && deliveryCheck.gate.blockReviewPageUntilDelivered && !deliveryCheck.delivered) {
      return res.status(403).json({
        error: 'Order not delivered yet',
        message: deliveryCheck.note,
        requiredOrderTag: deliveryCheck.gate.requiredOrderTag,
        delivered: false
      });
    }

    const products = await Promise.all((order.line_items || []).map(async (item) => {`;

    server = replaceOnce(server, find, replace, '/api/magic-link/order delivered block');
  }

  server = server.replace(
`      email: order.email || email,
      products`,
`      email: order.email || email,
      delivered: true,
      requiredOrderTag: deliveryCheck.gate.requiredOrderTag,
      products`
  );

  // 8. Delivery check routes.
  const deliveryRoutes = `
app.get('/api/admin/delivery-check', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain);
    const orderId = req.query.orderId;
    const email = req.query.email;

    if (!shopDomain || !orderId) {
      return res.status(400).json({ error: 'shopDomain and orderId are required.' });
    }

    const order = await findShopifyOrderByNumber(orderId);

    if (!order) {
      return res.status(404).json({ delivered: false, error: 'Order not found.' });
    }

    if (email && !orderEmailMatches(order, email)) {
      return res.status(403).json({ delivered: false, error: 'Order email does not match.' });
    }

    const deliveryCheck = await checkOrderDeliveryGate(shopDomain, order);

    return res.json({
      delivered: deliveryCheck.delivered,
      requiredOrderTag: deliveryCheck.gate.requiredOrderTag,
      gateEnabled: deliveryCheck.gate.enabled,
      orderName: order.name,
      orderNumber: order.order_number,
      tags: splitShopifyTags(order.tags),
      note: deliveryCheck.note
    });
  } catch (error) {
    console.error('Delivery check failed:', error);
    return res.status(500).json({ error: 'Failed to check delivery status.' });
  }
});

app.post('/api/admin/delivery-check', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.body.shopDomain || req.query.shopDomain);
    const orderId = req.body.orderId || req.query.orderId;
    const email = req.body.email || req.query.email;

    if (!shopDomain || !orderId) {
      return res.status(400).json({ error: 'shopDomain and orderId are required.' });
    }

    const order = await findShopifyOrderByNumber(orderId);

    if (!order) {
      return res.status(404).json({ delivered: false, error: 'Order not found.' });
    }

    if (email && !orderEmailMatches(order, email)) {
      return res.status(403).json({ delivered: false, error: 'Order email does not match.' });
    }

    const deliveryCheck = await checkOrderDeliveryGate(shopDomain, order);

    return res.json({
      delivered: deliveryCheck.delivered,
      requiredOrderTag: deliveryCheck.gate.requiredOrderTag,
      gateEnabled: deliveryCheck.gate.enabled,
      orderName: order.name,
      orderNumber: order.order_number,
      tags: splitShopifyTags(order.tags),
      note: deliveryCheck.note
    });
  } catch (error) {
    console.error('Delivery check failed:', error);
    return res.status(500).json({ error: 'Failed to check delivery status.' });
  }
});
`;

  server = insertBefore(
    server,
    '/* -------------------------------------------------------------------------- */\n/* Magic link / review submission',
    deliveryRoutes,
    'delivery-check routes',
    "/api/admin/delivery-check"
  );

  // 9. Widget config exposes deliveryGate.
  server = server.replace(
`    attributeProfiles: config?.attributeProfiles,
    betaMode: config?.betaMode`,
`    attributeProfiles: config?.attributeProfiles,
    deliveryGate: config?.deliveryGate || { enabled: true, requiredOrderTag: 'delivered', blockReviewPageUntilDelivered: true },
    betaMode: config?.betaMode`
  );

  write(serverFile, server);
  console.log('✅ server.js delivery gate patch complete.');
}

function patchMessaging() {
  const messagingFile = path.join(process.cwd(), 'public', 'admin-messaging-campaigns.js');

  if (!fs.existsSync(messagingFile)) {
    console.warn('⚠ public/admin-messaging-campaigns.js not found. Skipping messaging copy patch.');
    return;
  }

  let js = read(messagingFile);

  js = js.replace(
    'Order fulfilled → Wait <b id="flow-delay-preview">14</b> days → Send email',
    'Order fulfilled → Wait <b id="flow-delay-preview">14</b> days → If order tag contains <b>delivered</b> → Send email'
  );

  js = js.replace(
    'Order fulfilled → Wait <b id="flow-delay-copy-preview">14</b> days → Send email',
    'Order fulfilled → Wait <b id="flow-delay-copy-preview">14</b> days → Condition: order tag contains <b>delivered</b> → Send email'
  );

  js = js.replace(
    'In the Send email action, enable HTML and paste the generated code from the right.',
    'In Shopify Flow, add a condition before Send email: <strong>Order tags contains delivered</strong>. In the Send email action, enable HTML and paste the generated code from the right.'
  );

  if (!js.includes('Delivery failsafe:')) {
    js = js.replace(
`            <div class="nr-msg-help">
              <strong>Review page handle:</strong><br>
              /pages/<span id="flow-page-handle-preview-admin">leave-review</span>
            </div>`,
`            <div class="nr-msg-help">
              <strong>Review page handle:</strong><br>
              /pages/<span id="flow-page-handle-preview-admin">leave-review</span>
            </div>

            <div class="nr-msg-help">
              <strong>Delivery failsafe:</strong><br>
              The backend now blocks review-page order loading unless the Shopify order has the tag <code>delivered</code>. This prevents customers reaching the review form before delivery.
            </div>`
    );
  }

  write(messagingFile, js);
  console.log('✅ admin-messaging-campaigns.js delivery instructions patch complete.');
}

patchServer();
patchMessaging();

console.log(`
Next:
  1. Run: node -c server.js
  2. Commit:
     rm -rf node_modules && git add server.js public/admin-messaging-campaigns.js && git commit -m "Require delivered tag before review requests" && git push origin main
`);
