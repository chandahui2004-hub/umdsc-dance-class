# UMDSC — Setup Values (Public & Non-Secret)

These configuration values are **public by design** and are embedded into the client-side JavaScript bundle. The Google API key is locked to authorized origins and to the Google Drive and Picker APIs.

> 🔒 **SECURITY INVARIANT:**  
> **NEVER store, commit, or log these secrets in this file or anywhere in the repository:**  
> - Club Gmail account password  
> - OAuth client secret  
> - `TOKEN_SECRET` (used by Apps Script to sign JWT tokens)  
> - `SETUP_CODE` (one-time first-run setup initialization secret)  
> - `.admin-token` or administrator passwords  

---

## Google Accounts & GitHub

| Property | Value / Reference |
|---|---|
| **Club System Gmail** (owns DB folder & Apps Script) | `umdancesportc@gmail.com` |
| **GitHub Account** (repository owner) | `chandahui2004-hub` |
| **Repository URL** | [https://github.com/chandahui2004-hub/umdsc-dance-class](https://github.com/chandahui2004-hub/umdsc-dance-class) |

---

## Google Cloud Platform Project (`umdsc-class`)

| Property | Value / Key |
|---|---|
| **Project ID** | `umdsc-class` |
| **Project Number (`VITE_GOOGLE_APP_ID`)** | `764158079871` |
| **OAuth Web Client ID (`VITE_GOOGLE_CLIENT_ID`)** | `764158079871-o23bv9038hk864dosf87ls9gkhcpc65f.apps.googleusercontent.com` |
| **API Key (`VITE_GOOGLE_API_KEY`)** | `AIzaSyDaudiyWQ3MnU8aOz8TcAAvOwplQm8fJZc` |
| **OAuth Scope** | `https://www.googleapis.com/auth/drive.file` |
| **Authorized JavaScript Origins** | `http://localhost:5173`<br>`https://umdsc-dance-class.umdancesportc.workers.dev` |

---

## Backend API Deployment (Google Apps Script)

| Property | Value |
|---|---|
| **Script ID** | `1f3p4D-1zClfrSUmoa6g5zgw95c-MgTVQ8j0jKv7j1hVE1yNINQ5qw6iL` |
| **Production Deployment ID** | `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA` |
| **Latest Deployed Version** | `@104` (2026-11-15) |
| **Production Execution Endpoint (`VITE_API_URL`)** | `https://script.google.com/macros/s/AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA/exec` |
| **Deploy Command** | `npm run push -w api` |

The command `npm run push -w api` automatically compiles TypeScript, pushes code via clasp, and redeploys to the production deployment ID. Because the deployment ID is fixed, the production API URL never drifts.

---

## Background Engines & Triggers

- **Cache Warmup & Auto-Sync Trigger (`warmDancerCaches`):**
  - Configured by running `installWarmTrigger` once from the Google Apps Script project editor.
  - Runs periodically every 1–5 minutes:
    - Warms active event dancer caches and chunked indices.
    - Runs 60-second throttled response auto-sync with single-read optimizations.
    - Enforces the 3-layer Incomplete Sheet Row Guard.
    - Runs `syncFormStatusIfDue` every 10 minutes, checking Google Form open/close state and auto-gating styles at capacity.
    - Increments `DATA_VERSION` when underlying sheets change.

---

## Core System Scripts

| Script | Purpose | Execution |
|---|---|---|
| `scripts/live-sandbox-verify.mjs` | Automated end-to-end sandbox verification and self-cleaning lifecycle testing against the live GAS backend. | `node scripts/live-sandbox-verify.mjs` |
| `scripts/build-guide-docx.mjs` | Zero-dependency OOXML Word document compiler with PNG header parsing and embedded screenshots. | `node scripts/build-guide-docx.mjs` |
| `scripts/call.mjs` | CLI helper for sending authenticated or public API requests directly to the backend. | `node scripts/call.mjs <action> [payloadJson]` |

---

## Production Frontend Hosting

- **Hosting Platform:** Cloudflare Workers Static Assets (`wrangler.jsonc`)
- **Production URL:** [https://umdsc-dance-class.umdancesportc.workers.dev](https://umdsc-dance-class.umdancesportc.workers.dev)
- **Continuous Deployment:** Merging or pushing commits to branch `main` automatically triggers production builds.
