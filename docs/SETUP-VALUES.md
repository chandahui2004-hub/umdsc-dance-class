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
| Authorized JS origins / key referrers so far | `http://localhost:5173` — **add the Cloudflare Pages URL at go-live** (both the OAuth client origins and the API key website restrictions) |

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

## Still to fill in
- Apps Script web app URL (`VITE_API_URL`): created in the backend phase.
- Cloudflare Pages URL: created at go-live.
