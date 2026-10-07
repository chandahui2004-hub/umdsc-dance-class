# UMDSC — Setup Values (non-secret)

These values are **public by design**: they end up in the website's JavaScript bundle. The API key is locked to allowed websites and to the Drive and Picker APIs.

**NEVER put these in this file or anywhere in the repo:** the club Gmail password, the OAuth client secret, `TOKEN_SECRET`, `SETUP_CODE`, or admin passwords.

## Google accounts
| What | Value |
|---|---|
| Club system Gmail (runs the backend, owns the DB folder) | `umdancesportc@gmail.com` |
| GitHub account (gh CLI) | `chandahui2004-hub` |

## Google Cloud project (created 2026-09-28)
| What | Value |
|---|---|
| Project ID | `umdsc-class` |
| Project number (`VITE_GOOGLE_APP_ID`, used by Picker) | `764158079871` |
| OAuth Web Client ID (`VITE_GOOGLE_CLIENT_ID`) | `764158079871-o23bv9038hk864dosf87ls9gkhcpc65f.apps.googleusercontent.com` |
| API key "API UMDSC" (`VITE_GOOGLE_API_KEY`) | `AIzaSyDaudiyWQ3MnU8aOz8TcAAvOwplQm8fJZc` |
| OAuth scope | `https://www.googleapis.com/auth/drive.file` only |
| Authorized JS origins / key referrers | `http://localhost:5173` and `https://umdsc-dance-class.umdancesportc.workers.dev` (OAuth client origin without slash; API key referrer with `/*`) — owner to add the live one in Google Cloud at go-live |

## Drive links (test set, 2026-09-28) — all must be shared with the club Gmail as Editor
| What | ID |
|---|---|
| Club DB folder | `10rrxr82U3sSX16i8AksvFbMeWmsLxgST` |
| Live registration form response sheet | `1iyXlD-tknHP75vcq6I-hOWLtGueC8Sj5POiwAGLbJXg` |
| Test attendance folder | `1tcMfFpwjy8nPow34PuU2xAlceAZjj77Y` |
| Test video folder | `1_tr8IiPBvY36c1UQ5PTF9yKpZ-neMiZ6` |

These links are entered through the website's Settings / first-run setup, **not hardcoded**. They are listed here only for testing.

## Dance styles (seed)
Locking · Popping · Hip Hop · Latin

## Spike result (Task 2)
- **Status:** PASS
- **Scope used:** `https://www.googleapis.com/auth/drive.file`
- **Subfolder creation:** PASS (Created subfolder ID `1mhm6MpAu924zqMSIrhYjAYtZgZvY5Eet` inside parent folder `1_tr8IiPBvY36c1UQ5PTF9yKpZ-neMiZ6`)
- **Resumable upload:** PASS (Uploaded ~171MB MP4 file ID `1KjJb3LclWUGrQPbu5oOcywyhwFh9qqt_`)
- **Permission update:** PASS (Set `anyone`/`reader` on uploaded file)
- **Direct playback:** PASS (Streamed via Drive API key URL, video duration 79.97s, played successfully)

## Backend API (Apps Script)
- **Script ID:** `1f3p4D-1zClfrSUmoa6g5zgw95c-MgTVQ8j0jKv7j1hVE1yNINQ5qw6iL`
- **Deployment ID:** `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA` (Version 30, 2026-10-08)
- **API URL (`VITE_API_URL`):** `https://script.google.com/macros/s/AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA/exec`
- **Redeploy command (URL never changes):** `npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`
## Deployment verification (Task 9)
- **Status:** PASS
- **Setup Initialization:** `setup.init` executed successfully, created `UMDSC_System` spreadsheet in DB folder `10rrxr82U3sSX16i8AksvFbMeWmsLxgST`.
- **Schema verification:** Verified all 10 schema tabs exist and `DanceStyles` seeded with 4 rows.
- **Setup status:** `setup.status` confirmed `{"initialized": true}`.
- **Admin authentication:** Admin login verified.

## Still to fill in
- Live site (Cloudflare Workers static assets, auto-deploys on push to `main`, config `wrangler.jsonc`): https://umdsc-dance-class.umdancesportc.workers.dev (live 2026-10-04)


