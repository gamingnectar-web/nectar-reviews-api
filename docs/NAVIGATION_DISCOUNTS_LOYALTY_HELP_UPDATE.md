# Navigation, Discounts, Loyalty and Help Update

This update keeps the v25 Reviews/Loyalty/Cart Rewards logic intact and improves the admin usability layer.

## Product-context navigation

The left-hand navigation now changes depending on the active product area:

- Reviews: Dashboard, Reviews, Messaging & Campaigns, Reviews Visual Customiser, Import CSV.
- Loyalty: Loyalty, Messaging & Campaigns, Userboard, Points Rules, Tiers, Rewards, Checkout Beta, Loyalty Settings.
- Discounts: Discount Templates, How Codes Work, Issued Codes, Discount Settings.

Other product areas move into the Products group, so users can understand which module they are working in.

## Discounts

The Discounts product now includes clearer guidance explaining:

- Templates define the rule.
- Issue method decides whether the code is reserved in Nectar or created as a native Shopify discount code.
- Issued code tracking shows recipient/source/created/used status.

Manual test issuing now accepts a recipient email, source/order/note and private tracking note.

## Widget render names

The settings page now shows Shopify Liquid render snippets and app block names rather than Render API URLs.

## Loyalty

Loyalty now has clearer setup help for:

- Reward emails and how discount codes are connected to the Discounts module.
- Customer/Userboard privacy and live Shopify lookup.
- Purchase points rules.
- Tier earning rates and custom benefits.

Tiers can now carry a points-per-currency earning override and custom benefit labels.

## Help drawer

A deterministic bottom-right help drawer has been added. It takes common setup questions and deep-links users to the correct product area.
