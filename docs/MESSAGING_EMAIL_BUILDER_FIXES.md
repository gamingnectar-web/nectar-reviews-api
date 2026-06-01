# Messaging and email builder fixes

This package tightens the review email builder and messaging analytics areas.

## Added

- Colour picker buttons now show swatches instead of exposing raw hex values in the main form.
- Colour modals support explicit None / transparent selection.
- Heading typography controls: alignment, font weight and font family.
- Saved review email templates preserve typography settings.
- Full-width send result panel below the builder showing last success/failure, reason and the attempted email layout.
- Fake-order test email path now forces the job due immediately when `sendNow` is used and returns send result detail.
- Analytics now defaults to live/non-test data and can include test/fake emails with a checkbox.
- Analytics sent/open/click rates are based on true unique sent records, not inferred open-only rows.
- Hidden preset modules are shown in an expandable list with one-by-one restore buttons and restore-all.

## Checked

- `npm run deploy:preflight` passed.
