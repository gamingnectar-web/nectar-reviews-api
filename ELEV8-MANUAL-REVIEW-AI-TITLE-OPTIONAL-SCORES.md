# Manual Review: AI Title + Optional Scores

This patch is additive to the current Manual Add workflow.

## AI title
Each manual review row now has **AI generate title** beside the headline field.
It summarises the review body only and is instructed not to invent flavour/product claims or scores.

## Historical attribute scores
Sourness, Sweetness and Flavour are now independent opt-in fields.

They default **off**. A 5/10 slider value is only a UI starting point after you explicitly enable that score; it is not saved while disabled.

Examples:
- Historical review says nothing about flavour -> leave all three off.
- Says "really sweet" but nothing about sourness -> enable Sweetness only.
- Has original values for all three -> enable all three.

The normal review approval flow is unchanged: reviews are still saved Pending and only go live after approval.
