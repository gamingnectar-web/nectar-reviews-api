# Manual review fast-entry deploy hotfix

Render failed because the previous installer wrote a literal `\n` into `manual-review-import.js`.

This patch also fixes a second issue visible in the current `clean-main`: `activeManualBatchId` was referenced by **Save & add another** but never declared.

It additionally hides both save actions on the Draft Batches tab and resets the batch only when a brand-new Manual Add modal is opened.
