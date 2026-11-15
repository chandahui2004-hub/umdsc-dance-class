# Developer & Technical Architecture Guide

**For:** Software engineers and technical maintainers responsible for maintaining, enhancing, or auditing the UMDSC Dance Class System.  

| Resource | Value / Reference |
|---|---|
| **Source Code Repository** | [https://github.com/chandahui2004-hub/umdsc-dance-class](https://github.com/chandahui2004-hub/umdsc-dance-class) |
| **Clone Command** | `git clone https://github.com/chandahui2004-hub/umdsc-dance-class.git` |
| **Production Website** | [https://umdsc-dance-class.umdancesportc.workers.dev](https://umdsc-dance-class.umdancesportc.workers.dev) |
| **System IDs & Deployment Values** | [`docs/SETUP-VALUES.md`](../../SETUP-VALUES.md) |
| **Production Branch** | `main` (Pushing to `main` triggers automated Cloudflare Workers deployment) |

> 🔒 **Security Rules:** The repository is public. **Never commit secrets:** Google account passwords, `TOKEN_SECRET`, `SETUP_CODE`, `.admin-token`, `.clasprc.json`, or Apps Script script properties. These files are barred by `.gitignore`.

---

## 1. Monorepo architecture

The project is structured as an npm workspaces monorepo:

```
umdsc-dance-class/
├── api/          # Backend API running on Google Apps Script
│   ├── src/      # TypeScript source (controllers, db, auth, warmup, formGating)
│   ├── test/     # Vitest unit test suite (database, access, import, lock)
│   ├── build.mjs # esbuild bundle script -> api/dist/Code.js
│   └── package.json
├── web/          # Frontend SPA running on Cloudflare Workers
│   ├── src/      # React 19, TypeScript, Tailwind CSS v4, pixel art UI
│   ├── e2e/      # Playwright browser test suite (phone layout, adaptive UI)
│   ├── vite.config.ts
│   └── package.json
├── shared/       # Shared business logic and type definitions (@umdsc/shared)
│   ├── src/      # Shared interfaces, permissions, time helpers, validators
│   └── package.json
├── scripts/      # Operational and automated verification scripts
│   ├── live-sandbox-verify.mjs  # Live GAS sandbox test & self-cleaning verifier
│   ├── build-guide-docx.mjs     # Zero-dependency docx guide builder
│   ├── call.mjs                 # CLI API invocation helper
│   └── loadtest.mjs             # Concurrency and load testing suite
└── docs/         # Specifications, plans, handover, and guides
```

### Request & data lifecycle
```
Dancer / Admin Browser (React 19 SPA on Cloudflare Workers)
         │
         │  HTTPS JSON API (POST /?action=...)
         ▼
Google Apps Script Web App (api/dist/Code.js)
         ├── Auth & JWT validation (HMAC SHA-256 with TOKEN_SECRET)
         ├── Optimistic Concurrency & ScriptLock (withScriptLock)
         ├── Database Tables in Google Sheets (UMDSC_System spreadsheet)
         └── Google Forms Auto-Gating & Response Sheet Auto-Sync
         ▲
Direct Resumable Upload (Browser -> Google Drive API v3 using GIS OAuth token)
```

---

## 2. Local development environment

### Prerequisites
- **Node.js:** v24.x or higher
- **Git:** Standard git client
- **Google Clasp:** Globally or locally via `npx @google/clasp`

### Setup steps
```bash
git clone https://github.com/chandahui2004-hub/umdsc-dance-class.git
cd "UMDSC Dance Class System"
npm install
npm run dev          # Starts local Vite dev server at http://localhost:5173
```

On Windows, developers can also execute `START_UMDSC.bat`.

> ⚠️ **Live Server Interaction:** Local frontend development connects directly to the live Google Apps Script backend (`VITE_API_URL` in `web/.env.production`). Do not delete or overwrite real production records during testing.

---

## 3. Testing & verification suite

Run the complete verification pipeline before publishing code changes:

```bash
# 1. Monorepo unit tests across all packages
npm test -ws --if-present

# 2. Production build check (type-checking + esbuild + Vite)
npm run build

# 3. Mobile viewport layout tests (prevents horizontal cut-offs at 360px & 390px)
cd web ; npx playwright test e2e/phone-layout.spec.ts

# 4. Offline / isolated browser e2e tests
cd web ; npx playwright test --grep-invert "@internet"

# 5. Live GAS sandbox verification & clean teardown
node scripts/live-sandbox-verify.mjs

# 6. Word documentation compilation & OOXML verification
node scripts/build-guide-docx.mjs
```

---

## 4. Deploying the frontend (Cloudflare Workers)

Frontend deployments are fully automated via Cloudflare continuous integration:

```bash
git checkout main
git merge <feature-branch>
git push origin main
```

Cloudflare Workers detects the commit, runs `npm run build -w web`, and serves the static assets in `web/dist` per `wrangler.jsonc`. Deployment is complete within 60–90 seconds.

### Environment variables (`web/.env.production`)
- `VITE_API_URL`: Points to the Apps Script Web App execution endpoint.
- `VITE_GOOGLE_CLIENT_ID`: Google OAuth 2.0 Web Client ID for Drive Picker.
- `VITE_GOOGLE_API_KEY`: Google API Key restricted to Drive API v3 and designated HTTP referrers.
- `VITE_GOOGLE_APP_ID`: Google Cloud Project Number (used by Google Picker).

---

## 5. Deploying the backend API (Google Apps Script)

Whenever files in `api/` or `shared/` are updated, deploy the backend:

```bash
# In the api/ directory:
npm run push -w api
```

The script `npm run push -w api` automatically:
1. Compiles TypeScript via `esbuild` into `api/dist/Code.js`.
2. Pushes the code to Google Apps Script (`clasp push -f`).
3. Deploys the code directly to the immutable production deployment ID:  
   `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`.

> 💡 **Immutable Endpoint:** Because the deployment ID remains static, the production API URL never changes, eliminating frontend configuration drift.

### Backend background jobs & triggers
- **`warmDancerCaches` time-driven trigger:** Run `installWarmTrigger` once in the Apps Script project editor. It executes every 1–5 minutes:
  - Warms memory caches for active events and dancer bootstrap chunks.
  - Throttles response sheet synchronization (`AUTO_SYNC_SECONDS = 60`) with single-read optimizations.
  - Enforces the **3-Layer Incomplete Sheet Row Guard**, safely ignoring half-filled form rows.
  - Checks Google Form status every 10 minutes (`syncFormStatusIfDue`), auto-closing forms whose styles have reached capacity (`styleSlots`) and auto-syncing manual closures.
  - Automatically increments `DATA_VERSION` in Script Properties so clients invalidate stale React Query data.

---

## 6. UI & sustainability guidelines

The codebase adheres to strict frontend design and performance standards:

1. **8-Bit Retro Neon Aesthetic:**
   - Visual identity uses custom pixel art icons (`web/src/components/ui/pixelIcons.tsx`), neon glow borders (`--neon-cyan`, `--neon-pink`, `--neon-gold`, `--neon-orange`), and dark theme backdrops (`--night-1`, `--violet-1`).
   - Do NOT apply generic corporate design skills (`taste-skill`, `minimalist-skill`, `brutalist-skill`); respect the retro gaming aesthetic.
2. **Accessible Typography:**
   - **No fonts smaller than 10px:** Every text element across `web/src/` must be `>= 10px` (`text-[10px]` or larger) to ensure effortless readability on high-DPI smartphone displays.
3. **Touch Targets:**
   - All interactive controls, inputs, and buttons must satisfy a minimum tap target of `44px` (`min-h-[44px]`).
4. **Zero Horizontal Overflow:**
   - Layouts must remain responsive with zero horizontal scrolling on narrow viewports down to `360px` and `390px`.
5. **State Management & React Query:**
   - Centralize React Query cache keys and invalidations through `web/src/lib/queryClient.ts`.
   - Never write duplicate API parsing helpers; utilize canonical helpers from `@umdsc/shared`.
