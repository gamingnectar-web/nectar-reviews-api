# ELEV8 AI review image import

Adds an **Import from images** tab to Manual Add Reviews.

Workflow:
1. Select any number of screenshots.
2. Browser compresses them before upload.
3. Images are analysed one-by-one with the configured OpenAI key.
4. Review text is transcribed faithfully; title is copied or generated if absent.
5. Explicit historic Sourness/Sweetness/Flavour scores are imported only when actually visible.
6. ELEV8 searches Shopify for the extracted product name.
7. Confident matches become Ready.
8. Unresolved reviews remain in the persistent image batch as **Needs product mapping**.
9. Ready drafts can be moved into the normal Manual Add form for final review/editing.
10. Existing Manual Add draft/approval workflow remains unchanged.

The screenshots themselves are not stored in MongoDB; the extracted draft, filename, mapping candidates and status are stored.

The patch also improves manual review field layout, focus states, spacing, textarea height and attribute-score cards.
