#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(pwd)}"
cd "$ROOT"

ENV_FILE="src/config/env.js"
PUBLIC_ROUTE="src/routes/notifications.js"
SERVICE_FILE="src/modules/notifications/notifications.service.js"
STOREFRONT_ROUTE="src/modules/notifications/routes/storefront.routes.js"
SHOPIFY_SERVICE="src/modules/notifications/services/shopifyNotifications.js"

for f in "$ENV_FILE" "$PUBLIC_ROUTE" "$SERVICE_FILE" "$STOREFRONT_ROUTE" "$SHOPIFY_SERVICE"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing required file: $f" >&2
    exit 1
  fi
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".notifications-v5-5-backup-$STAMP"
mkdir -p "$BACKUP"

cp "$ENV_FILE" "$BACKUP/env.js"
cp "$PUBLIC_ROUTE" "$BACKUP/notifications.js"
cp "$SERVICE_FILE" "$BACKUP/notifications.service.js"
cp "$STOREFRONT_ROUTE" "$BACKUP/storefront.routes.js"
cp "$SHOPIFY_SERVICE" "$BACKUP/shopifyNotifications.js"

python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])

env_path = root / "src/config/env.js"
public_route_path = root / "src/routes/notifications.js"
service_path = root / "src/modules/notifications/notifications.service.js"
storefront_path = root / "src/modules/notifications/routes/storefront.routes.js"
shopify_service_path = root / "src/modules/notifications/services/shopifyNotifications.js"

env_text = env_path.read_text(encoding="utf-8")
public_route = public_route_path.read_text(encoding="utf-8")
service = service_path.read_text(encoding="utf-8")
storefront = storefront_path.read_text(encoding="utf-8")
shopify_service = shopify_service_path.read_text(encoding="utf-8")

# 1. Shopify App Proxy scope
if "write_app_proxy" not in env_text:
    old = "read_products,write_products,read_inventory,write_inventory,read_customers,write_customers,read_orders,write_files,read_content,write_content,read_online_store_pages"

    if old not in env_text:
        raise SystemExit("Could not locate Shopify scope list.")

    env_text = env_text.replace(
        old,
        old + ",write_app_proxy",
        1
    )

# 2. Ensure secure Shopify customer identity lookup exists
if "async function getCustomerIdentity(" not in shopify_service:
    anchor = "async function getCustomerSnapshot(shopDomain,customerId){"

    helper = """async function getCustomerIdentity(shopDomain,customerId){
  const query=`query Elev8NotificationCustomerIdentity($id: ID!) {
    customer(id:$id){ id email }
  }`;

  const data=await shopifyAdminGraphql({
    shopDomain,
    query,
    variables:{id:customerGid(customerId)}
  });

  return data?.customer||null;
}

"""

    if anchor not in shopify_service:
        raise SystemExit("Could not locate getCustomerSnapshot()")

    shopify_service = shopify_service.replace(
        anchor,
        helper + anchor,
        1
    )

old_export = "module.exports={getCustomerSnapshot,getOrderDeliverySnapshot,getProductSnapshot,resolveOrderDelivery,fulfilmentDeliveryState};"

if old_export in shopify_service:
    shopify_service = shopify_service.replace(
        old_export,
        "module.exports={getCustomerIdentity,getCustomerSnapshot,getOrderDeliverySnapshot,getProductSnapshot,resolveOrderDelivery,fulfilmentDeliveryState};",
        1
    )

# 3. Direct storefront routes get a trusted server-side source name
old_sub = "return res.json(await subscribeRestock({ ...req.body, shopDomain }));"

new_sub = "return res.json(await subscribeRestock({ ...req.body, shopDomain, source: 'shopify_product_page_direct' }));"

if old_sub in public_route:
    public_route = public_route.replace(
        old_sub,
        new_sub,
        1
    )

old_unsub = "return res.json(await unsubscribeRestock({ shopDomain, email: req.body.email, variantId: req.body.variantId }));"

new_unsub = "return res.json(await unsubscribeRestock({ shopDomain, email: req.body.email, variantId: req.body.variantId, source: 'shopify_product_page_direct' }));"

if old_unsub in public_route:
    public_route = public_route.replace(
        old_unsub,
        new_unsub,
        1
    )

# 4. App Proxy unsubscribe identifies itself as storefront traffic
old_proxy_unsub = """  const result=await unsubscribeRestock({
    shopDomain:req.shopDomain,
    email,
    variantId:req.body?.variantId
  });"""

new_proxy_unsub = """  const result=await unsubscribeRestock({
    shopDomain:req.shopDomain,
    email,
    variantId:req.body?.variantId,
    source:'shopify_app_proxy'
  });"""

if old_proxy_unsub in storefront:
    storefront = storefront.replace(
        old_proxy_unsub,
        new_proxy_unsub,
        1
    )

# 5. New storefront subscriptions MUST sync to Shopify
old_sync = """  let shopifySynced = false;
  if (config.delivery?.syncShopifyTags !== false) {
    try {
      await syncShopifyRestockTags({ shopDomain, email: normalizedEmail, resolved, action: 'add' });
      shopifySynced = true;
    }
    catch (error) {
      await RestockSubscription.updateOne({ _id: row._id }, { $set: { lastError: `Shopify tag sync: ${String(error.message || error).slice(0,420)}` } });
      await recordEvent(shopDomain,'restock_tag_sync_failed',{variantId:row.variantId,productId:row.productId,productTitle:row.productTitle,emailHash:key,detail:String(error.message||error).slice(0,500)});
      if ((config.delivery?.mode || 'flow') === 'flow') throw publicError('Your alert was saved, but Shopify Flow tag sync failed. Check the write_customers permission in Notifications Center.', 502);
    }
  }"""

new_sync = """  const storefrontSource = /^shopify_(?:product_page|app_proxy)/i.test(String(source || ''));
  const mustSyncShopify = storefrontSource || config.delivery?.syncShopifyTags !== false;

  let shopifySynced = false;

  if (mustSyncShopify) {
    try {
      await syncShopifyRestockTags({
        shopDomain,
        email: normalizedEmail,
        resolved,
        action: 'add'
      });

      shopifySynced = true;
    }
    catch (error) {
      await RestockSubscription.updateOne(
        { _id: row._id },
        {
          $set: {
            lastError: `Shopify tag sync: ${String(error.message || error).slice(0,420)}`
          }
        }
      );

      await recordEvent(
        shopDomain,
        'restock_tag_sync_failed',
        {
          variantId:row.variantId,
          productId:row.productId,
          productTitle:row.productTitle,
          emailHash:key,
          detail:String(error.message||error).slice(0,500)
        }
      );

      if (storefrontSource) {
        await RestockSubscription.updateOne(
          { _id: row._id },
          {
            $set: {
              status:'unsubscribed',
              unsubscribedAt:new Date()
            }
          }
        );

        throw publicError(
          'Your alert could not be confirmed in Shopify. Please try again, or check the write_customers permission in Notifications Center.',
          502
        );
      }

      if ((config.delivery?.mode || 'flow') === 'flow') {
        throw publicError(
          'Your alert was saved, but Shopify Flow tag sync failed. Check the write_customers permission in Notifications Center.',
          502
        );
      }
    }
  }"""

if old_sync in service:
    service = service.replace(
        old_sync,
        new_sync,
        1
    )
elif "mustSyncShopify" not in service:
    raise SystemExit(
        "Could not patch Shopify tag sync in subscribeRestock()."
    )

# 6. Make unsubscribe support old Shopify-only alerts
start = service.find(
    "async function unsubscribeRestock({"
)

end = service.find(
    "\nfunction createTransporter(",
    start
)

if start < 0 or end < 0:
    raise SystemExit(
        "Could not locate unsubscribeRestock()"
    )

new_unsubscribe = r"""async function unsubscribeRestock({
  shopDomain,
  email,
  variantId,
  source = 'storefront'
}) {
  const normalizedEmail = cleanEmail(email);

  if (!normalizedEmail || !variantId) {
    return {
      success:true,
      subscribed:false,
      status:'none'
    };
  }

  const numericVariantId =
    String(variantId).replace(/[^0-9]/g, '');

  const key =
    emailHash(shopDomain, normalizedEmail);

  const row =
    await RestockSubscription.findOne({
      shopDomain,
      emailHash:key,
      variantId:numericVariantId
    });

  const config =
    await getOrCreateConfig(shopDomain);

  const storefrontSource =
    /^shopify_(?:product_page|app_proxy)/i.test(
      String(source || '')
    );

  /*
   * Older Gaming Nectar alerts may only exist as
   * Shopify customer tags and have no ELEV8 database row.
   */
  let resolved = row
    ? {
        variantId: row.variantId,
        productId: row.productId,
        productTitle: row.productTitle,
        productHandle: row.productHandle,
        productUrl: row.productUrl,
        productImage: row.productImage,
        variantTitle: row.variantTitle
      }
    : null;

  if (!resolved) {
    try {
      resolved =
        await resolveSubscriptionVariant(
          shopDomain,
          numericVariantId
        );
    }
    catch (error) {
      if (storefrontSource) {
        throw error;
      }
    }
  }

  let shopifySynced = false;

  if (
    resolved &&
    (
      storefrontSource ||
      config.delivery?.syncShopifyTags !== false
    )
  ) {
    try {
      await syncShopifyRestockTags({
        shopDomain,
        email: normalizedEmail,
        resolved,
        action: 'remove'
      });

      shopifySynced = true;
    }
    catch (error) {
      await recordEvent(
        shopDomain,
        'restock_tag_sync_failed',
        {
          variantId:numericVariantId,
          productId:
            row?.productId ||
            resolved?.productId ||
            '',
          productTitle:
            row?.productTitle ||
            resolved?.productTitle ||
            '',
          emailHash:key,
          detail:
            String(
              error.message ||
              error
            ).slice(0,500),
          meta:{
            action:'remove',
            legacyOnly:!row
          }
        }
      );

      if (storefrontSource) {
        throw publicError(
          'Your alert could not be removed from Shopify. Please try again.',
          502
        );
      }
    }
  }

  const updated =
    await RestockSubscription.findOneAndUpdate(
      {
        shopDomain,
        emailHash:key,
        variantId:numericVariantId
      },
      {
        $set:{
          status:'unsubscribed',
          unsubscribedAt:new Date(),
          lastError:''
        }
      },
      {
        new:true
      }
    );

  await recordEvent(
    shopDomain,
    'restock_unsubscribed',
    {
      variantId:numericVariantId,
      productId:
        updated?.productId ||
        resolved?.productId ||
        '',
      productTitle:
        updated?.productTitle ||
        resolved?.productTitle ||
        '',
      emailHash:key,
      meta:{
        shopifySynced,
        legacyOnly:!row
      }
    }
  );

  return {
    success:true,
    subscribed:false,
    status:
      updated
        ? 'unsubscribed'
        : 'none',
    shopifySynced
  };
}
"""

service = (
    service[:start] +
    new_unsubscribe +
    service[end:]
)

env_path.write_text(
    env_text,
    encoding="utf-8"
)

public_route_path.write_text(
    public_route,
    encoding="utf-8"
)

service_path.write_text(
    service,
    encoding="utf-8"
)

storefront_path.write_text(
    storefront,
    encoding="utf-8"
)

shopify_service_path.write_text(
    shopify_service,
    encoding="utf-8"
)

print("Patched:")
for p in [
    env_path,
    public_route_path,
    service_path,
    storefront_path,
    shopify_service_path
]:
    print(" -", p)
PY

echo
echo "=== Syntax checks ==="

node --check "$PUBLIC_ROUTE"
node --check "$SERVICE_FILE"
node --check "$STOREFRONT_ROUTE"
node --check "$SHOPIFY_SERVICE"

echo
echo "=== V5.5 checks ==="

grep -n "write_app_proxy" "$ENV_FILE"
grep -n "mustSyncShopify" "$SERVICE_FILE"
grep -n "legacyOnly" "$SERVICE_FILE"

echo
echo "=== FULL PREFLIGHT ==="

npm run deploy:preflight

echo
echo "V5.5 backend installed successfully."
echo "Backup: $BACKUP"
