# Coverage

A recruiting-pipeline CRM: the bankers you're tracking, the firms they sit at,
what stage each conversation is in, and the outreach drafts that go with them.

The whole app is one file — `index.html`. No build step, no server, no account.
It runs two ways: opened directly in a browser, or installed as a native desktop
app through the Electron shell in `electron/`.

## What's new in 1.1.0

- **Templates tab** — email templates moved out of Settings into their own tab.
- **Per-contact interaction log** — record calls, emails and notes against a
  contact, with quick actions from the contact drawer.
- **N/A pipeline stage** — for contacts that sit outside the funnel.
- **UTF-8 declared explicitly** — punctuation and em dashes render correctly
  instead of turning into mojibake.

## Run it as a desktop app

```bash
npm install
npm run electron
```

That opens Coverage in its own window with its own Dock icon.

### Build an installer

```bash
npm run dist:mac     # -> release/Coverage-1.1.0-arm64.dmg
```

Open the `.dmg` and drag Coverage to Applications. `npm run dist:win` and
`npm run dist:linux` are there too; each builds for the machine it runs on.

The build is not code-signed, so the first launch needs one of:

- **Right-click the app → Open**, then confirm at the prompt (only once), or
- `xattr -dr com.apple.quarantine /Applications/Coverage.app`

macOS otherwise refuses to open apps from an unidentified developer.

## Run it in a browser instead

Open `index.html`. Keep the `assets/` folder next to it — that's where the fonts
live. The file works on its own without them, it just falls back to system fonts.

## Where your data lives

Records are stored by the app itself, not in `index.html`, so **replacing the app
with a newer build never touches them.** Nothing is uploaded anywhere; there is
no server involved.

The desktop app serves the page over a private `app://coverage` origin
specifically so this holds. Pages opened over `file://` get an origin that
browsers do not treat as stable, and the records saved under it can disappear on
an update or a Chromium change.

The consequence is that **the desktop app and the browser version keep separate
records.** They are different origins, so they do not share a database.

### Moving records from the browser version into the app

1. Open the browser copy → **Settings** → **Data** → **Copy all data as JSON**.
2. Open the desktop app → **Settings** → **Data** → paste into *Restore from
   backup* → **Replace all data**.

The same two steps, in reverse, move data back out. **Settings → Data** is also
where to take a backup before any big cleanup — worth doing periodically, since
this is a local-only app with no server-side copy to fall back on.

## Updating

```bash
git pull
npm install          # only if package.json changed
npm run dist:mac     # then replace Coverage in Applications
```

Your records stay put across updates.

## Layout

```
index.html        the entire app — markup, styles, logic, seed data
assets/
  fonts.css       @font-face rules for the three families below
  fonts/          Spectral, Public Sans, IBM Plex Mono (woff2, SIL OFL 1.1)
electron/
  main.js         the native shell: app:// protocol, window, menus
build/
  icon.png        source icon; electron-builder derives .icns/.ico from it
```

Fonts are self-hosted rather than pulled from the Google Fonts CDN. A stylesheet
the machine cannot reach blocks every script behind it, which meant the app came
up as a blank window with no network rather than an unstyled one.
