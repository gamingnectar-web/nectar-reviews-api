# Review image import CSP hotfix

The admin Content Security Policy permits `img-src 'self' data: https:` but does not permit `blob:`.

The first image-import implementation used `URL.createObjectURL(file)`, producing a `blob:` image URL. The browser therefore rejected the image before it ever reached the AI endpoint.

This patch uses `FileReader.readAsDataURL()` instead. `data:` is already allowed by the existing CSP, so there is no need to weaken the security policy by adding `blob:` globally.
