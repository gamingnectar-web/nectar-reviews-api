# All Reviews v5 resolver

The historical review records currently visible on `/pages/reviews` have blank
productTitle/productHandle/productUrl values. Direct Shopify lookup by their stored
itemId is not resolving them.

v5 therefore resolves product identity in this order:

1. Shopify Product ID.
2. Shopify Variant/Product GraphQL fallback already installed by v4.
3. Shopify catalogue search using meaningful words from the review headline/comment.
4. Conservative confidence scoring requiring product-title overlap.
5. If still unresolved: do not create a recommendation card and do not show a fake
   product image/initial or a raw ID.

A successful catalogue match is persisted back into MongoDB, so subsequent requests
do not need fuzzy catalogue resolution.
