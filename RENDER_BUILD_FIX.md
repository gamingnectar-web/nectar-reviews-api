# Render build fix

This full repo zip patches package-lock.json so dependency tarballs resolve from the public npm registry, not the temporary internal sandbox registry. Render build should run `npm ci && npm run deploy:preflight` as defined in render.yaml.
