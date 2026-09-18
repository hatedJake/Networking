# Coverage

A local-first networking CRM for recruiting outreach — contacts, the firms
behind them, every conversation you have had, where each one stands, and what
you owe whom next.

Your records live only on the machine you are using, in the app's own storage.
Nothing is uploaded anywhere, and the app makes no network requests at all: the
fonts ship with it and the page's Content-Security-Policy permits nothing
off-origin.

## Running it

Open `index.html` in a browser and it works. For the desktop app:

```sh
npm install
npm start      # run from source
npm test       # unit tests — no install needed, uses node:test
npm run dist   # build .dmg files into dist/ (macOS only)
```

## Layout

| Path | What it is |
|---|---|
| `index.html` | The whole interface: styles, markup, and the view layer |
| `src/core.js` | Domain logic — dates, the stage machine, the interaction log and call counting, email patterns, merge fields, CSV, and the normalisation every load passes through |
| `test/core.test.js` | The suite over `src/core.js` |
| `electron/main.js` | The desktop wrapper |
| `fonts/` | Vendored woff2 subsets, see `fonts/LICENSE.md` |

`src/core.js` holds everything that is a pure function of its arguments, which
is what makes it testable in Node. `index.html` keeps thin bindings that supply
the live state, so the call sites read the same as they did before the split.
It loads as a plain script rather than an ES module because modules are blocked
over `file://`.

## Back up your data

There is no sync and no server. Clearing browser data, or reinstalling, takes
your records with it. **Settings → Data → Download JSON backup** writes a
`coverage-<date>.json` file; restore it from the same place, by file or by
pasting. Do it before any big cleanup.

The app keeps the last copy that parsed under a second key and falls back to it
if the newest one is unreadable, but that is a seatbelt, not a backup.

## The interaction log

Each contact keeps a dated record of what actually happened — calls, texts,
email chains, coffee chats, meetings — separate from the scratch notes. Entries
are searchable, editable in place, and exported with the CSV.

Logging a **Call** carries the contact to the call-happened stage and sets the
dates for you, the same as moving the stage by hand would. Backfilling an old
conversation never moves a date or a stage backwards, so catching up on records
after the fact is safe.

Calls are counted from two places and summed: the log, plus a bare tally for
calls with no entry behind them (anything from before you started logging, or
ones you would rather not write up). Writing a call up and keeping a count
never counts it twice. Firms show the total across their contacts, which is why
the Firms table counts calls rather than replies — a reply is a means, a call
is the outcome.

## Pipeline stages

Stage names are yours to rename, reorder or add to in Settings. Behaviour comes
from each stage's *kind* — not started, outreach sent, they replied, call
booked, call happened, advocate, closed out — so renaming a stage keeps what it
does and carries its contacts with it. Position within a run matters where you
would expect: the first outreach stage is the cold send and later ones are
bumps, so adding a third bump behaves like the two beside it.

## Desktop app (macOS)

`electron/main.js` wraps the same `index.html` in an Electron window so it can
live in the Dock like a normal Mac app.

### Getting a .dmg without building locally

The `Build macOS app` workflow builds on a GitHub-hosted macOS runner and
attaches the `.dmg` files to a GitHub Release, so you can download the app from
the [Releases page](../../releases) on any machine.

Two ways to trigger it:

- **Tag a version** — pushing any tag starting with `v` builds and publishes a
  release at that tag. The tag must match the version in `package.json`, since
  that is what names the `.dmg`; CI fails the build if they disagree:
  ```sh
  git tag v1.0.0 && git push origin v1.0.0
  ```
- **Run it by hand** — Actions → *Build macOS app* → **Run workflow**. Without a
  tag name it publishes a pre-release tagged `v<version>-build.<run number>`.

Each run produces two disk images — `Coverage-<version>-arm64.dmg` for Apple
Silicon and `Coverage-<version>-x64.dmg` for Intel — and also uploads them as
workflow artifacts, so a plain `workflow_dispatch` run gives you the file even
before it becomes a release.

### First launch

The build is unsigned (no Apple Developer ID certificate is configured), so
Gatekeeper will object the first time. Right-click the app in Applications →
**Open** → **Open**. If macOS instead calls it "damaged", clear the download
quarantine flag:

```sh
xattr -dr com.apple.quarantine /Applications/Coverage.app
```

To sign and notarize properly later, add the certificate and Apple ID secrets to
the repo and drop `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` from the build step.

## Tests

`npm test` runs `node --test` over `test/`. There is nothing to install: the
suite uses only `node:test` and `node:assert`.

CI runs it in three timezones. That is not decoration — the day-counting bug the
suite now guards against passed silently on a UTC runner and only appeared in a
zone that observes daylight saving, which is how it survived as long as it did.

## Known gaps

- The topbar and tables overflow horizontally below about 520px. The app is
  built for a desktop window and has not been laid out for phone widths.
- Deletes are guarded by a confirmation but there is no undo.
- Editing a contact's firm to a name that does not exist silently creates a new
  firm, so a typo leaves a near-duplicate behind.
