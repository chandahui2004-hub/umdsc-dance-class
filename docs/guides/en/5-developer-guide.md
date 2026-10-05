# Developer & Source Code Guide

**For:** whoever maintains or changes the code in the future.

| | |
|---|---|
| **Source code (GitHub)** | https://github.com/chandahui2004-hub/umdsc-dance-class |
| **Download the code** | `git clone https://github.com/chandahui2004-hub/umdsc-dance-class.git` |
| **Live website** | https://umdsc-dance-class.umdancesportc.workers.dev |
| **Setup values** (IDs, deployment ID, URLs) | [`docs/SETUP-VALUES.md`](../../SETUP-VALUES.md) |
| **Branch that goes live** | `main`. Every push to `main` republishes the website. |

> 🔒 The repository is **public**. Never commit passwords, the `.admin-token` file, `.clasprc.json`, or Apps Script property values. These are already listed in `.gitignore`.

---

## 1. How it fits together

```
Dancer / admin browser
   │  (website: React app, hosted on Cloudflare Workers static assets)
   ▼
Google Apps Script web app  ──►  Google Sheet database (club Drive)
   (the API: logins, data)       Google Drive folders (attendance sheets)
   ▲
Browser → Google Drive directly, for video uploads (Google sign-in, drive.file scope)
```

- **`web/`:** the website. React 19, TypeScript, Vite, Tailwind CSS v4.
- **`api/`:** the server. TypeScript, bundled with esbuild into `api/dist/Code.js`, deployed to Google Apps Script with **clasp**.
- **`shared/`:** types and helpers used by both.
- **`docs/`:** these guides (`docs/guides/`), setup values, and the design history (`docs/superpowers/specs` and `plans`: why things were built the way they are).
- **`scripts/`:** helper scripts, for example `call.mjs` to call the API from a terminal.

---

## 2. Run it on your computer

Needs **Node.js 24** and **Git**.

```bash
git clone https://github.com/chandahui2004-hub/umdsc-dance-class.git
cd umdsc-dance-class
npm install
npm run dev          # website at http://localhost:5173
```

On Windows you can also double-click **`START_UMDSC.bat`**.

The local website talks to the **live** server (`VITE_API_URL` in `web/.env.local` / `web/.env.production`), so be careful: changes made locally change real data.

To test on a phone on the same Wi-Fi, run `npm run dev -w web -- --host` and open the "Network" address it prints.

---

## 3. Tests: run them before every publish

```bash
npm test                                         # unit tests (shared + api + web)
npm run build                                    # type-check and build everything
cd web && npx playwright test --grep-invert @internet   # browser tests (phone + desktop)
```

`web/e2e/phone-layout.spec.ts` checks that nothing is cut off at phone widths. Keep it passing.

---

## 4. Publish the website

```bash
git push origin main
```

Cloudflare (Workers & Pages › **umdsc-dance-class**) builds it with `npm run build` and deploys `web/dist`, using **`wrangler.jsonc`** in the repo root. It's live in about 1–2 minutes. Check **Deployments** in the Cloudflare dashboard if it isn't.

Website settings are in **`web/.env.production`**: the API URL, the Google OAuth client ID, the API key and the app ID. These are browser keys and are public by design. They are locked to the website's address in Google Cloud (API key › Website restrictions; OAuth client › Authorized JavaScript origins). **If the website address ever changes, add the new address in both places.**

---

## 5. Deploy the server (Apps Script)

Only needed when something in `api/` or `shared/` changes.

```bash
cd api
npx clasp login          # once, sign in as umdancesportc@gmail.com
npm run push             # build + upload the code
npx clasp update-deployment <DEPLOYMENT_ID>   # make it live; ID is in docs/SETUP-VALUES.md
```

`update-deployment` keeps the **same URL**, so the website needs no change. Record the new version number in `docs/SETUP-VALUES.md`. Check it works by opening `<API URL>?action=health`, which should answer `{"ok":true,...}`.

**Apps Script › Project Settings › Script properties** (values are secret; never copy them into GitHub):

| Property | Meaning |
|---|---|
| `SYSTEM_SPREADSHEET_ID` | The database Google Sheet |
| `TOKEN_SECRET` | Signs login sessions. Changing it logs everyone out. |
| `SETUP_CODE` | One-time code for first setup |
| `CLUB_EMAIL` | The club Gmail |
| `DATA_VERSION`, `PERM_VERSION` | Managed automatically |

**Speed-up trigger:** run `installWarmTrigger` once from the Apps Script editor. It keeps the dancers' first load fast by warming the caches every 5 minutes.

---

## 6. Where the data lives

- **Database:** one Google Sheet. Each tab is a table: Settings, Events, DanceStyles, Instructors, ClassSessions, MemberIndex, AttendanceSheets, Admins, Roles, RolePermissions, MemberRoles, Videos, Music, Sections, LinkHistory and AuditLog. Its folder is shown in System Settings › Database Folder. **Don't edit the sheet by hand** unless you know the code; columns are matched by header name.
- **Registrations:** each event's Google Form response sheet. It is read-only for the system.
- **Attendance:** Google Sheets created per event in the attendance folder.
- **Videos:** each class lead's Drive folder › event › class.

---

## 7. Making changes

1. Read the matching design doc in `docs/superpowers/specs/` first.
2. Make the change with tests (`*.test.ts(x)` next to the code; browser tests in `web/e2e/`).
3. Run section 3's commands. Deploy the server (section 5) **before** pushing website code that needs it.
4. `git push origin main` (section 4).

Useful facts:
- Times use Malaysia time (`Asia/Kuala_Lumpur`).
- Permission codes are listed in `shared/src/types.ts` (`PERMISSIONS`).
- Video upload and compression: `web/src/features/media/UploadDialog.tsx` and `web/src/lib/media/videoCompressor.ts`. Videos up to 150 MB upload as the original by default.
- Phone layout: `web/src/app/PhoneShell.tsx`. Every page must work at 360 px wide.
