# Admin polish and email builder fixes

This update tightens the Messaging & Campaigns builder and the main admin navigation.

## Sidebar

- Desktop sidebar is fixed to the viewport.
- The sidebar scrolls internally if its contents are taller than the screen.
- Mobile/tablet layout still stacks normally.

## Email builder preview

- Builder preview now sits in a compact right-hand rail on desktop.
- Preview rail is sticky while editing the email controls.
- Added a Full preview modal for checking the full layout without scrolling to the bottom of the builder.

## Colour controls and buttons

- Refined colour modal styling.
- Refined button/pill/template-card styling.
- Colour controls continue to support None / transparent.

## SMTP validation

- SMTP host is now validated before saving/sending.
- If an email address is entered as the host, the app gives a specific message explaining that the host must be a mail server such as smtp.gmail.com or smtp.office365.com.

## Templates

- Saving a template with the same name updates that template instead of creating duplicate cards.
