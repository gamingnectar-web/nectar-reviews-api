const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'extensions', 'review-widget-extension', 'assets', 'nectar-all-reviews-page.js');
if (!fs.existsSync(file)) throw new Error('nectar-all-reviews-page.js not found.');
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  "const image = mediaUrl(review);",
  "const image = review.productImage || mediaUrl(review);"
);

src = src.replace(
  "const safeTitle = esc(review.productTitle || 'Customer review');",
  "const safeTitle = esc((review.productTitle && !/^\\\\d{6,}$/.test(String(review.productTitle))) ? review.productTitle : 'Customer review');"
);

src = src.replace(
  "const image = mediaUrl(review);\n      const media = card.querySelector('.nectar-seo-float__media');",
  "const image = review.productImage || mediaUrl(review);\n      const media = card.querySelector('.nectar-seo-float__media');"
);

src = src.replace(
  "const labels = [...(data.topTags || []).map((t) => t.label), ...(data.recommendations || []).map((r) => r.productTitle)]",
  "const labels = [...(data.topTags || []).map((t) => t.label), ...(data.recommendations || []).map((r) => r.productTitle)].filter((label) => label && !/^\\\\d{6,}$/.test(String(label)))"
);

fs.writeFileSync(file, src);
console.log('✓ Updated storefront renderer to prefer Shopify product images and hide numeric product labels.');
