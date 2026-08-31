# Coverage

A networking / relationship CRM that runs entirely in the browser. The whole app is
one self-contained file — `index.html` — with no build step, no server, and no install.

## Download and run it locally

1. Go to the [Releases page](https://github.com/hatedJake/Networking/releases).
2. Under the latest release, download `Coverage.html` from **Assets**.
3. Double-click the downloaded file. It opens in your browser and is ready to use.

That's it. Data stays in that browser profile on your machine.

Prefer the bleeding edge? Download
[`index.html` from `main`](https://github.com/hatedJake/Networking/raw/main/index.html)
instead — same thing, untagged.

## Cutting a new release

Releases are produced by [`.github/workflows/release.yml`](.github/workflows/release.yml).
Either way works:

**From the GitHub UI** — Actions → **Release** → *Run workflow* → enter a version such
as `v1.1.0`. The tag is created for you.

**From the command line:**

```sh
git tag v1.1.0
git push origin v1.1.0
```

The workflow stamps the version into the file and publishes a release with two assets:

- `Coverage.html` — stable name, always the newest in that release
- `Coverage-v1.1.0.html` — version-pinned copy

Versions must start with `v`. Release notes are generated from the commits since the
previous tag.
