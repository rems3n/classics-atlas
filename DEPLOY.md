# Deployment

## GitHub Pages

The root `index.html` is a generated, self-contained static app. Configure GitHub Pages to deploy from the `main` branch and `/(root)` directory. The `.nojekyll` file disables Jekyll processing. No secrets, database, or server are required. `classics-atlas-source.zip` contains the editable source tree; extract it, run `python3 scripts/build.py`, and upload the regenerated root `index.html` to publish changes.

## Optional Railway deployment

Status: prepared and locally tested, **not deployed**. Railway was absent from the connected tools and plugin search, and no Railway CLI or Railway environment credential was configured. No public URL or project was created.

## Service configuration

- Use this directory as the Railway service root. If a repository contains the outer `classics-atlas/` folder, set that as the root directory.
- Railway uses the included Dockerfile. It serves the prebuilt, versioned `dist/classics-atlas.html`; deployment does not crawl metadata providers or require Python.
- The application listens on `0.0.0.0` and Railway's `PORT` environment variable.
- Health check: `/health`.
- After a successful deployment, choose **Generate Domain** in the service's public networking settings, then verify the app and a shared-search URL.
- No application API keys, database, or volume are needed. Shelves and ratings remain browser-local and are not synchronized between visitors or devices.

Publishing to Railway requires a connected Railway account/tool or an authenticated Railway CLI. Do not put account tokens in this repository or the HTML.

Official reference: https://docs.railway.com/networking/public-networking

## Local smoke check

```sh
npm start
```

Open http://localhost:3000 and http://localhost:3000/health. The host only serves the HTML and health endpoint, blocks source/cache paths, supports gzip and cache revalidation, and shuts down on SIGTERM.

Rebuild with `python3 scripts/build.py` before deploying source changes. The build uses saved metadata, not live network requests.
