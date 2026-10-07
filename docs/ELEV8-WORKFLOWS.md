# ELEV8 Automations — Workflow Companion replacement

Version 1.0.0

## What this module is

ELEV8 Automations is an independent workflow engine inside the existing ELEV8 Node/Express/Mongo application. It is intentionally able to run without Shopify Flow, so a Basic-plan store can use ELEV8 automations even though custom-distributed Flow task extensions are restricted by Shopify.

It provides:

- workflow definitions with triggers, ALL/ANY conditions and ordered actions;
- before/after snapshot tracking for Shopify resources;
- manual, REST, chained and scheduled starts;
- REST bearer-token management;
- loop protection (10 matching starts in 30 minutes, or 500 while temporary debug mode is enabled);
- run history, step outputs and failures;
- HTTP actions with Basic/Bearer/custom-header credentials and 429 retry;
- Shopify Admin GraphQL;
- AI generation through OpenAI, Anthropic or Google Gemini;
- plain SMTP email and block-based styled email;
- random integer and current UTC datetime;
- encrypted credentials;
- templates and an ELEV8 admin UI.

## Trigger types

`resource_event`, `field_changed`, `metafield_changed`, `tags_added`, `tags_removed`,
`attributes_changed`, `line_items_changed`, `product_options_changed`, `lifecycle`,
`custom`, and `schedule`.

The trigger resource can be any string. The UI includes the resources relevant to Workflow
Companion: orders, draft orders, products, variants, collections, customers, companies,
company locations, locations, markets, shop, pages, blogs, blog posts, metaobjects,
discounts, customer segments, and inventory levels.

## Actions

`current_datetime`, `random_integer`, `set_variable`, `http_request`, `shopify_graphql`,
`ai_generate`, `email`, `email_styled`, `start_workflow`, `bulk_start`, `stop`.

Use `{{path.to.value}}` placeholders in action configuration. Outputs from an action with
id `action_1` are available as `{{outputs.action_1...}}` to later actions.

## Shopify webhook bridge

ELEV8 already has a Shopify webhook receiver. Do not create a second HMAC implementation
unless needed. After the existing receiver has verified Shopify's HMAC, call:

```js
const { ingestEvent } = require('../modules/workflows');

await ingestEvent({
  shopDomain,
  topic, // e.g. products/update
  resourceType: 'product',
  resourceId: String(payload.id),
  payload,
  source: 'shopify',
});
```

Snapshots are saved after matching, so the next event can produce a before/after delta.

For metafield triggers, provide metafields in the payload. If the Shopify webhook payload
does not contain them, enrich the payload with the relevant metafields through the Admin
GraphQL API before calling `ingestEvent`.

## REST trigger

Create a token in **Automations → Integrations**, then call:

```http
POST /api/workflows/trigger/product
Authorization: Bearer e8wf_...
Content-Type: application/json

{
  "specifier": "supplier-import-complete",
  "itemId": "gid://shopify/Product/123",
  "resource": { "id": "gid://shopify/Product/123", "status": "ACTIVE" },
  "additionalParameters": {
    "stringParameter": "x-zero"
  }
}
```

## Credentials

Set `ELEV8_WORKFLOWS_SECRET` to a long random secret before saving credentials.
Credentials are AES-256-GCM encrypted at rest.

Typical credential JSON:

OpenAI:
`{"apiKey":"..."}`

Anthropic:
`{"apiKey":"..."}`

Gemini:
`{"apiKey":"..."}`

Bearer:
`{"token":"..."}`

SMTP:
`{"host":"smtp.example.com","port":587,"secure":false,"username":"...","password":"...","from":"GamingNectar <hello@example.com>"}`

Shopify GraphQL can use a bearer credential containing `{"token":"shpat_..."}` or the
`ELEV8_SHOPIFY_ADMIN_TOKEN` environment variable. Prefer wiring this to ELEV8's existing
per-shop OAuth token resolver before using the module on multiple stores.

## Safety choices

The module does **not** execute arbitrary server-side JavaScript supplied from the UI.
Workflow Companion offers JavaScript transforms for HTTP/GraphQL responses; doing that
inside the main ELEV8 process without a proper isolate creates an unnecessary remote-code
execution surface. ELEV8 stores full JSON outputs, so downstream conditions/templates can
use the returned data. Add an isolated transform worker later if arbitrary transforms become
necessary.

AI actions run only when explicitly added to an enabled workflow. There is no background AI
retry loop.

## Native Shopify Flow integration

The engine does not require Shopify Flow. If ELEV8 is later moved to **public distribution**,
the same engine can be exposed as native Flow trigger/action extensions. For a
custom-distributed app, Shopify limits custom Flow triggers/actions to Shopify Plus stores.

## Verification

Run:

```bash
node --check src/modules/workflows/workflows.models.js
node --check src/modules/workflows/workflows.crypto.js
node --check src/modules/workflows/workflows.engine.js
node --check src/modules/workflows/workflows.service.js
node --check src/modules/workflows/workflows.scheduler.js
node --check src/modules/workflows/workflows.routes.js
node --check public/modules/workflows/admin.js
node scripts/workflows-smoke-test.js
npm run deploy:preflight
```


### Bulk starts

`bulk_start` can use an explicit `items` array or a Shopify search query for customers,
orders, products, companies or metaobjects. It de-duplicates IDs, queues one run per item,
and returns `startedWorkflows` plus the queued run IDs. Unlike Workflow Companion, a malformed
Shopify search query fails safely rather than silently widening to every object.
