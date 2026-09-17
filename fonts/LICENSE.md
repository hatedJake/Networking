# Bundled fonts

These `.woff2` files are the `latin` and `latin-ext` subsets published by Google
Fonts, vendored here so the app renders identically offline and makes no network
request when it is opened.

| Family | Weights | Licence | Upstream |
|---|---|---|---|
| Spectral | 400, 600, 700 | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Spectral |
| Public Sans | 400, 500, 600 | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Public+Sans |
| IBM Plex Mono | 400, 500, 600 | SIL Open Font License 1.1 | https://fonts.google.com/specimen/IBM+Plex+Mono |

The SIL Open Font License 1.1 permits redistribution and bundling with an
application. Full text: https://openfontlicense.org/

## Refreshing them

Fetch the stylesheet with a browser user agent so Google serves woff2, keep only
the `latin` and `latin-ext` `@font-face` blocks, download each `.woff2` into this
directory and repoint the `src:` URLs at `fonts/<file>`:

```sh
curl -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
```
