# Coverage

A local-first networking CRM. The whole app is a single `index.html` — open it in a
browser and it works, with your data kept in the browser's local storage.

## Desktop app (macOS)

`electron/main.js` wraps that same `index.html` in an Electron window so it can live
in the Dock like a normal Mac app.

### Getting a .dmg without building locally

The `Build macOS app` workflow builds on a GitHub-hosted macOS runner and attaches the
`.dmg` files to a GitHub Release, so you can download the app from the
[Releases page](../../releases) on any machine.

Two ways to trigger it:

- **Tag a version** — pushing any tag starting with `v` builds and publishes a release
  at that tag:
  ```sh
  git tag v1.0.0 && git push origin v1.0.0
  ```
- **Run it by hand** — Actions → *Build macOS app* → **Run workflow**. Without a tag
  name it publishes a pre-release tagged `v<version>-build.<run number>`.

Each run produces two disk images — `Coverage-<version>-arm64.dmg` for Apple Silicon and
`Coverage-<version>-x64.dmg` for Intel — and also uploads them as workflow artifacts, so
a plain `workflow_dispatch` run gives you the file even before it becomes a release.

### First launch

The build is unsigned (no Apple Developer ID certificate is configured), so Gatekeeper
will object the first time. Right-click the app in Applications → **Open** → **Open**.
If macOS instead calls it "damaged", clear the download quarantine flag:

```sh
xattr -dr com.apple.quarantine /Applications/Coverage.app
```

To sign and notarize properly later, add the certificate and Apple ID secrets to the
repo and drop `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` from the build step.

### Building locally

```sh
npm install
npm start      # run the app from source
npm run dist   # build .dmg files into dist/ (macOS only)
```
