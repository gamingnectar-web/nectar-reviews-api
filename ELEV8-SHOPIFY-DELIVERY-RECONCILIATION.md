# ELEV8 Shopify-first delivery reconciliation

Priority:
1. Shopify fulfilment `deliveredAt`
2. Shopify fulfilment status/displayStatus says Delivered
3. Track123 says Delivered
4. Track123 supplies in-transit detail

Once Shopify confirms delivery, ELEV8 stores DELIVERED and stops polling that parcel.
