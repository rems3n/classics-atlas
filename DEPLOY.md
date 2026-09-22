# Deployment

Production runs on Railway. The root `index.html` also works as a static page, but accounts, sync and published collections need the Node backend.

## Current Railway configuration

Checked on 2026-09-22 with the Railway CLI (`railway status`, `railway volume list`, `railway variables --kv`) and the Railway GraphQL `domains` query.

| Setting | Value |
| --- | --- |
| Project / environment / service | `classics-atlas` / `production` / `atlas-web` |
| Source | GitHub `rems3n/classics-atlas`, branch `main`, deployed on push |
| Build | `Dockerfile` (see `railway.json`) |
| Public domain | `atlas-web-production-b852.up.railway.app`, target port **3000** |
| Volume | `atlas-data`, mounted at `/data`, 1 GB |
| Required variables | `ATLAS_DB=/data/atlas.sqlite`, `NODE_ENV=production`, `PORT=3000` |
| Healthcheck | `GET /health`, 60 s timeout |
| Replicas | 1. SQLite must not be shared by several replicas. |

### The port must match the domain

The server listens on `$PORT`. Railway injects its own `PORT` at runtime when the variable is not set. The public domain forwards to port 3000. If the two differ, the healthcheck still passes (it uses the injected port) but every public request returns `502 Application failed to respond`.

This happened on 2026-09-22. `PORT` was unset and the domain targeted 3000. The fix is to pin the variable:

```sh
railway variable set PORT=3000 --service atlas-web --environment production
```

The startup log line now prints the listening port, for example `Classics Atlas ready on port 3000 (database /data/atlas.sqlite)`. Compare it with the domain's target port in the service's Networking settings.

## Google sign-in

Off until both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. While off, the account dialog shows only username and password.

### Create the OAuth client (Google Cloud Console)

1. Open https://console.cloud.google.com/ and create or select a project.
2. Go to **Google Auth Platform** and fill in **Branding**: app name `Classics Atlas`, a support email, and the home page `https://atlas-web-production-b852.up.railway.app`.
3. In **Audience**, choose **External**, then **Publish app**. The app asks only for the `openid` scope, which does not need Google verification. While in testing mode, only listed test users can sign in. Without brand verification, Google's consent screen shows the `railway.app` domain instead of the app name. Brand verification is optional and requires a domain you own.
4. In **Clients**, choose **Create client**, type **Web application**, and add these **Authorized redirect URIs**:
   - `https://atlas-web-production-b852.up.railway.app/auth/google/callback`
   - `http://localhost:3000/auth/google/callback` (local development only)
5. Copy the client ID and client secret.

### Configure Railway

```sh
railway variable set GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com --service atlas-web --environment production
railway variable set ATLAS_PUBLIC_URL=https://atlas-web-production-b852.up.railway.app --service atlas-web --environment production
railway variable set GOOGLE_CLIENT_SECRET --stdin --service atlas-web --environment production
```

The last command reads the secret from standard input, so it stays out of shell history. Paste it and end input with Ctrl-D. This `--stdin` step is untested; confirm with `railway variables --kv | cut -d= -f1` that `GOOGLE_CLIENT_SECRET` is listed. `ATLAS_PUBLIC_URL` fixes the redirect URI so it does not depend on the request's Host header. It must match the URI registered with Google exactly. In production, Google sign-in stays off and the log says why if `ATLAS_PUBLIC_URL` is missing.

### Verify

```sh
curl -s https://atlas-web-production-b852.up.railway.app/api/session           # "google":true
curl -s -o /dev/null -D - https://atlas-web-production-b852.up.railway.app/auth/google | grep -i ^location
```

The location must start with `https://accounts.google.com/` and contain the production `redirect_uri`. Then sign in once in a browser. A new Google account gets a username like `reader-3fa2c1`.

### How it works

- `GET /auth/google` stores a one-time state, a PKCE verifier and a nonce in `oauth_states` (10 minutes). It also sets a `SameSite=Lax` cookie holding the state, then redirects to Google.
- `GET /auth/google/callback` requires the state in the URL, the cookie and the database row to agree. It exchanges the code with the PKCE verifier, and checks the ID token's issuer, audience, expiry and nonce. Signature checks are not needed because the token comes straight from Google's token endpoint over TLS (OpenID Connect Core 3.1.3.7).
- Accounts are matched by Google's `sub` ID, stored in `users.google_sub`. No email or name is stored.
- A signed-in password account can connect Google from the account menu. A Google account cannot be connected to two Classics Atlas accounts.
- Google-only accounts have no password or recovery code. They delete the account by typing the username.
- The `google_sub` column is added automatically on startup to databases created by earlier versions. This was tested against a database created by commit 56e6bfe.

## Verifying a deployment

A deployment is verified only when all of these pass against the public URL. Railway's `SUCCESS` status alone is not sufficient.

```sh
B=https://atlas-web-production-b852.up.railway.app
curl -s -o /dev/null -w "%{http_code}\n" $B/health          # 200 and {"ok":true}
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" -H 'Accept-Encoding: br' $B/        # home page, 200, about 30 KB
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" -H 'Accept-Encoding: br' $B/atlas   # app, 200, about 1.5 MB
curl -s $B/api/session                                         # {"user":null,"google":true|false}
curl -s -o /dev/null -w "%{http_code}\n" $B/server.cjs         # 404
railway logs --deployment --service atlas-web | tail -5        # "ready on port 3000", "Backup written"
```

Also check that the deployed commit matches `git rev-parse HEAD` on `main`:

```sh
railway deployment list --service atlas-web | head -3
```

`/health` runs `SELECT 1` against SQLite and returns 503 if the database cannot be read.

## Database, backups and restore

- **Live database:** `/data/atlas.sqlite` on the `atlas-data` volume, WAL mode, file mode 600.
- **Automatic snapshots:** once at startup and then hourly, the server writes `/data/backups/YYYY-MM-DD.sqlite` (UTC date) using SQLite's online backup API. Each write goes to a `.tmp` file and is renamed into place, so an interrupted backup does not replace a good one. The latest seven daily files are kept. Each successful write logs `Backup written`, and a failure logs `Backup failed`.
- **Limitation:** the snapshots live on the same volume as the database. They protect against bad writes and application bugs, not against losing the volume. Before a wider launch, copy a snapshot off Railway on a schedule, or enable Railway volume backups in the service's Volume settings.

### Copy a snapshot off the service

Untested on Railway. The command below streams a file over `railway ssh`; confirm it on a non-critical day first.

```sh
railway ssh --service atlas-web -- cat /data/backups/$(date -u +%F).sqlite > atlas-$(date -u +%F).sqlite
```

### Restore from a snapshot

Untested on Railway. Tested locally: a snapshot opens read-only with `node:sqlite` and contains the expected users.

1. Pick the snapshot to restore, for example `/data/backups/2026-09-21.sqlite`.
2. Keep a copy of the current database before replacing it.
3. Stop writes by scaling the service to zero replicas, or restore during a quiet period and accept that writes made after the snapshot are lost.
4. Replace the live files and remove the old WAL files so SQLite does not replay them onto the restored copy:
   ```sh
   railway ssh --service atlas-web -- sh -c 'cp /data/atlas.sqlite /data/atlas.pre-restore.sqlite && cp /data/backups/2026-09-21.sqlite /data/atlas.sqlite && rm -f /data/atlas.sqlite-wal /data/atlas.sqlite-shm && chown node:node /data/atlas.sqlite'
   ```
5. Redeploy or restart the service, then run the verification checks above and sign in with a test account.

### If the volume is lost

With the volume gone, the server starts with an empty database. Accounts, cloud reading state and published collections are lost unless an off-service copy exists. Guest data is unaffected because it lives in each visitor's browser. Signed-in visitors keep a local copy of their shelf and any unsynced changes in browser storage, and can export it from the reading menu. Restore the most recent off-service snapshot as described above.

## Logging and monitoring

- Logs go to stdout and stderr and are visible with `railway logs`.
- Logged events: startup port and database path, each backup, `SIGTERM`, and unexpected server errors with method, path and stack. Expected client errors such as 400, 401, 403, 404, 409 and 429 are returned to the client and not logged.
- Passwords, session tokens, recovery codes and reading data are never logged.
- Minimum monitoring before a wider launch: an external uptime check on `/health` (not only Railway's deploy-time healthcheck), and an alert on `Backup failed` in logs.

## Shutdown

On `SIGTERM` the server stops accepting connections, closes idle keep-alive connections, and exits once in-flight requests finish, or after 8 seconds at most. The SQLite handle is closed on a clean exit.

## Local smoke check

```sh
python3 scripts/build.py
npm test
NODE_ENV=production ATLAS_DB=/tmp/atlas-smoke/atlas.sqlite PORT=3291 npm start
```

Then run the verification commands above against `http://127.0.0.1:3291`. Production mode adds `Secure` to the session cookie and sends `Strict-Transport-Security`.

## Static hosting

The generated `index.html` runs without a server. On a static host the account menu reports that cloud accounts are unavailable, and guest reading works from browser storage. Rebuild with `python3 scripts/build.py` before publishing. The build uses saved metadata, not live network requests.
