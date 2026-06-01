# Admin polish and fake-order email fixes

This package tightens the Messaging & Campaigns admin UI and fixes the fake-order email send path.

## Key changes

- Fixed the Email Builder markup so the live preview is a true right-side sticky column on desktop.
- Added a Full Preview modal for checking the email layout at a larger size.
- Improved template cards, buttons, pills and modal styling.
- Improved colour picker styling and moved hex input into an advanced section.
- Added stronger fixed-sidebar CSS and a small sidebar helper so the navigation remains visible on long admin pages.
- Added SMTP host validation in the admin UI.
- Added provider presets for Gmail and Outlook SMTP.
- Fixed fake-order send recipient priority so it uses the Email Delivery recipient before the Review Page Tester fallback.
- Fixed fake-order send-now processing so the due job runner targets the newly-created fake-order job instead of possibly processing older jobs first.

## SMTP note

The SMTP host must be a mail server, not an email address.

Good examples:

- smtp.gmail.com
- smtp.office365.com

Bad example:

- help@gamingnectar.com

Use the email address in SMTP username / From email instead.
