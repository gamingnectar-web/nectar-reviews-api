# ELEV8 Review Delivery Countdown

This makes the review-request operational flow much easier to understand.

## Live rule

The intended live journey is now:

1. Shopify order exists
2. Order is fulfilled / dispatched
3. ELEV8 monitors Shopify fulfilment/tracking
4. Shopify registers the active fulfilment(s) as **Delivered**
5. ELEV8 stores `deliveredAt`
6. A **7-day countdown** starts
7. At the end of day 7 the review email becomes due
8. The normal review sender sends the primary Reviews template

The countdown is based on `scheduledAt`, which is created from the confirmed delivery timestamp + 7 days.

## Review Operations UI

The old dense delivery table is replaced with a Shopify-style order card showing:

`Ordered → Dispatched → Delivered → Review email`

Each delivered order has a visible 7-day progress bar, due date, parcel tracking, delivery source and current email state.

## Existing settings migration

Changing the code default does not alter a Settings document that already stores 14 days.

Run this once after deployment if you want existing 14-day Review configurations moved to 7 days:

```bash
node scripts/set-review-delay-7-days.cjs
```

It only updates settings where the delay is missing or currently 14 days; deliberately customised values such as 10/21/30 are left alone.
