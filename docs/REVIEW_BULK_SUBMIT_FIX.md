# Review bulk submission fix

Fixes the storefront `leave-a-review` / `leave-review` page error where the customer saw:

> Something went wrong while submitting the reviews.

## Root cause

`POST /api/public/reviews/bulk` was checking for a duplicate review using `email` and `itemId` before those variables existed in the bulk route. That caused a server-side ReferenceError and returned a 500 response before the valid bulk duplicate-checking path could run.

## Changes

- Removed the premature duplicate lookup from the bulk review endpoint.
- The endpoint now relies on the existing `alreadyReviewedProductIds` check, which correctly handles every product in the submitted order.
- Storefront review page alerts now show the backend error message when one is returned, instead of always showing the generic failure text.

## Expected result

Order-and-products review links can submit one or more product reviews successfully. Already-reviewed products are still blocked and surfaced correctly.
