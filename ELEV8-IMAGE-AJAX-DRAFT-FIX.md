# ELEV8 image-import AJAX draft fix

Fixes two workflow problems:

1. Mapping/searching one product no longer wipes edits made in other screenshot cards. Before any queue rerender, all editable card values are copied into the in-memory item state; the changed item is also persisted to MongoDB.
2. **Add this draft** now saves the review directly into the normal pending Manual Review batch via AJAX. It does not switch to the Add Reviews tab and does not rebuild/redirect the page.

A single manual draft batch id is reused while working through the current image-import session, so 20 individually-added reviews still end up in one pending batch.

The image batch also records `addedToManualDraft`, `manualReviewBatchId`, `manualReviewSavedAt`, and moves its item status to `drafted`.
