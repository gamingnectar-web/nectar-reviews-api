const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'routes', 'public.js');
if (!fs.existsSync(file)) throw new Error('src/routes/public.js not found. Run from repository root.');
let src = fs.readFileSync(file, 'utf8');

const marker = "const minRating = clampNumber(req.query.minRating, 0, 5, 0);";
if (!src.includes(marker)) {
  if (src.includes("const exactRating = clampNumber(req.query.rating")) {
    console.log('Exact SEO rating search already installed.');
    process.exit(0);
  }
  throw new Error('Could not find SEO rating marker in src/routes/public.js; refusing unsafe patch.');
}

src = src.replace(
  marker,
  `${marker}\n    const exactRating = clampNumber(req.query.rating || req.query.exactRating, 0, 5, 0);`
);

src = src.replace(
  "if (minRating) match.rating = { $gte: minRating };",
  "if (exactRating) match.rating = exactRating;\n    else if (minRating) match.rating = { $gte: minRating };"
);

src = src.replace(
  "filters: { q, minRating, itemId },",
  "filters: { q, minRating, rating: exactRating, itemId },"
);

fs.writeFileSync(file, src);
console.log('Installed exact 1–5 star filtering for /api/reviews/seo-page.');
