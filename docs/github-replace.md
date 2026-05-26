# Replacing the GitHub repo

This zip is intended to replace the current repo contents.

## Clean replacement in Codespaces

From the repo root:

```bash
rm -rf ./* ./.[^.]* 2>/dev/null || true
```

Then upload/copy the contents of this zip into the repo root.

After upload:

```bash
npm install
npm run structure
git status
git add .
git commit -m "Replace repo with modular Nectar architecture"
git push
```

## Important

Do not unzip this into a nested folder inside the repo unless you intend to move the files up one level. The repo root should contain:

```txt
package.json
server.js
src/
public/
docs/
Shopify-Liquid/
```
