# Root cause

`window.adminFetch()` already prepends `/api`:

```js
fetch(`${API}${withShop(path)}`)
```

where `API = window.location.origin + '/api'`.

The newer Brand Directory and Commerce Pulse scripts passed full `/api/admin/...` paths to
`adminFetch`, producing requests such as:

`/api/api/admin/brand-directory-v3/brands`

That is why the live build returned `Not found` even though the Express routes were mounted.

This patch:
- uses `/admin/...` paths when calling `adminFetch`;
- removes the older Brand Directory scripts that overwrite the v3 UI;
- cache-busts the corrected scripts;
- fixes brand scrape job routing.
