const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function check(ok, message) {
  if (!ok) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

const registry = read('src/modules/workflows/workflows.webhookRegistry.js');

check(registry.includes("const METAOBJECT_TOPICS = new Set"), 'metaobject webhook topics are identified');
check(registry.includes('metaobjectDefinitions(first:100'), 'metaobject definition types are discovered dynamically');
check(registry.includes('nodes{ id topic uri format filter }'), 'webhook inspection reads Shopify filters');
check(registry.includes("if (filter) input.filter = filter"), 'webhook creation sends required filter');
check(registry.includes('metaobjectFilterForType'), 'each metaobject type gets a Shopify filter');
check(registry.includes("missingFilters.length === 0"), 'metaobject topic is connected only when all required filters are present');
check(registry.includes('filterCount'), 'sync telemetry records filtered-subscription coverage');
check(!registry.includes("input:{ uri:address, format:'JSON' }"), 'legacy unfiltered create payload is gone');

if (process.exitCode) process.exit(process.exitCode);
console.log('ELEV8 Shopify Webhooks V5 metaobject filter smoke test passed.');
