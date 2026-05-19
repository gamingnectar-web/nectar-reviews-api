/*
  Nectar Reviews — App Bridge admin route fix

  Purpose:
  Shopify Resource Picker requires Shopify App Bridge.
  App Bridge requires the shopify-api-key meta tag and app-bridge.js script
  to be present in the rendered app HTML.

  1. Add this near the top of server.js:
     const fs = require('fs');

  2. Replace your current /admin route:

     app.get('/admin', (req, res) => {
       res.sendFile(path.join(__dirname, 'admin.html'));
     });

     with this route:
*/

app.get('/admin', (req, res) => {
  try {
    const adminPath = path.join(__dirname, 'admin.html');
    let html = fs.readFileSync(adminPath, 'utf8');

    html = html.replace(
      /<meta name="shopify-api-key" content="[^"]*"\s*\/?>/i,
      `<meta name="shopify-api-key" content="${process.env.SHOPIFY_API_KEY || ''}" />`
    );

    if (!html.includes('name="shopify-api-key"')) {
      html = html.replace(
        /<head>/i,
        `<head>\n  <meta name="shopify-api-key" content="${process.env.SHOPIFY_API_KEY || ''}" />`
      );
    }

    if (!html.includes('https://cdn.shopify.com/shopifycloud/app-bridge.js')) {
      html = html.replace(
        /(<meta name="shopify-api-key" content="[^"]*"\s*\/?>)/i,
        `$1\n  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>`
      );
    }

    res.type('html').send(html);
  } catch (error) {
    console.error('Failed to render admin with App Bridge:', error);
    res.sendFile(path.join(__dirname, 'admin.html'));
  }
});
