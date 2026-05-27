# Flow, provider and responsive admin fix

This update tightens the real-world customer journey testing and the admin UI.

## Shopify Flow setup guidance

The Real-world Test Centre now explains how to create the Shopify Flow workflow rather than only saying Flow is missing.

Recommended review request workflow:

1. Open Shopify Admin → Apps → Flow.
2. Create a workflow.
3. Choose an order/fulfilment trigger, normally Order fulfilled for review requests.
4. Add a Wait step, such as 14 days.
5. Add the email/action step.
   - Simple path: paste the Nectar Flow HTML from Messaging & Campaigns → Settings.
   - Advanced path: use a HTTP request action to call Nectar.
6. Turn the workflow on.
7. Tick “Shopify Flow review email is installed” in Real-world Test Centre.
8. Run the fake-order test and confirm the review comes back into Reviews as a test.

## Provider persistence

Saving the active email provider now also creates/updates a saved provider card. This avoids the previous confusion where SMTP showed connected but the saved provider list stayed empty.

## Reminder fix

Manual reminder sending now creates the missing tracking metadata before writing a campaign event. This fixes the server-side failure caused by undefined reminder metadata fields.

## Responsive admin fixes

The sidebar groups now behave like collapsible sections on smaller screens. Review attribute bars and card side panels also wrap instead of overlapping.
