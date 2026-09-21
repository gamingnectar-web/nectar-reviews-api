# Marketing Intelligence navigation hotfix

The Marketing Intelligence tile existed on the ELEV8 home screen and the target admin view also existed.

However, `elev8-context-nav.js` intercepts ELEV8 home-tile clicks before the dashboard's own click handler. Its `openModule()` map had no `marketing` entry, so clicking the tile stopped there and did nothing.

This patch adds:
- `marketing -> Marketing Intelligence` to the home-tile routing map.
- Marketing Intelligence to the active ELEV8 module context when opened from the sidebar.
