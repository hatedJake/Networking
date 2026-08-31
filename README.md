# Coverage

A single-file networking tracker that runs entirely on your machine. No
accounts, no server to rent, no build step, no dependencies beyond Python 3
(which macOS already has).

## Run it

```
python3 server.py
```

Your browser opens automatically. Ctrl+C to stop.

## Make it a Mac app

```
python3 make_app.py
```

Produces `Coverage.app` — double-click to launch, Cmd-Q to quit. It opens a
Chrome app window (no tabs, no address bar) if Chrome, Edge, Brave, or Chromium
is installed, and falls back to your default browser otherwise. Drag it to
/Applications if you want it in Launchpad.

To rebrand for another project, edit the three constants at the top of
`make_app.py` (`APP_NAME`, `BUNDLE_ID`, `ICON_LETTER`) and the matching
`APP_NAME` in `server.py`. The icon is generated from those — no image files.

## Where data lives

`index.html` picks the most durable store that answers, and Settings tells you
which one it landed on:

1. **`server.py` is serving the page** — records go to
   `~/Library/Application Support/Coverage/data.json`.
2. **Published as an artifact** — records go to the page's own private
   document store, so republishing the page never touches them.
3. **Opened straight off disk** — browser localStorage, which is fine for a
   quick look but is not a file you can back up.

Under the server, the data file sits outside the app bundle, so it survives
moving, updating, or reinstalling. Every save also writes a timestamped copy to
`backups/` beside it (last 40, only when something actually changed). Writes
are atomic, so an interrupted save cannot leave a half-written file.

Override the location with `COVERAGE_DATA_DIR=/some/path python3 server.py`.

## The three files

- `index.html` — the whole app: UI, styles, logic, and a seed dataset. Opens
  standalone; talks to `server.py` when served by it.
- `server.py` — stdlib only. Serves the page, owns `data.json`, keeps backups.
  Binds to `127.0.0.1`, so nothing is reachable from your network.
- `make_app.py` — wraps the two into a macOS `.app` with a generated icon.

## Ships with sample data

Six fictional contacts tagged `sample`, and a directory of ~86 banks and PE
firms with tiers. Delete the samples and add your own; Settings has JSON and CSV
export plus restore-from-backup.
