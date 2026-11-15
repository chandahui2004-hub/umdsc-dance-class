# UMDSC Dance Class System — Club Handover & Operations Guide

Welcome to the operations manual for the **UMDSC Dance Class System** (University of Malaya Dancesport Club). This document outlines how the system operates, maintenance procedures, and instructions for incoming club executive committees and administrators.

---

## 1. Club Gmail & System Stewardship

- **System Google Account**: `umdancesportc@gmail.com`
- **Ownership Scope**:
  - Owns the primary Google Drive database folder (`UMDSC_System` spreadsheet and tables).
  - Owns the Google Apps Script Web App backend deployment.
  - Owns Google Cloud Platform project `umdsc-class` (OAuth consent, Google Picker, and YouTube Data API v3).
- **Security Invariants**:
  - **Never store, log, or commit passwords, `TOKEN_SECRET`, `SETUP_CODE`, or `.admin-token` in this repository or in any public forum.**
  - **Executive Transition Handover**:
    1. Transfer Google Account 2-Step Verification phone numbers and emergency recovery email to the incoming Vice President or Technical Director.
    2. Review and audit third-party connections at [myaccount.google.com/connections](https://myaccount.google.com/connections).
    3. Ensure at least two executive committee members maintain physical 2FA security keys or verified device prompts.

---

## 2. Monthly Executive Workflow

The monthly operations cycle follows a standardized 5-step operational rhythm:

### Step 1: Create Month / Event via Event Wizard
1. Log in to the administrative interface at `/admin/login` and navigate to **Events › + NEW EVENT**.
2. Provide the event name (e.g. `2026-11 Monthly Classes`), date ranges, and select dance styles (Locking, Popping, Hip Hop, Latin).
3. **Google Form Edit URL (`formUrl`):** Paste the edit URL of the monthly Google Form so the system can automatically gate and close registration when capacity is reached.
4. **Per-Style Slot Limits (`styleSlots`):** Define venue capacity per dance style (e.g. Locking: 25, Popping: 25, Hip Hop: 30, Latin: 20).
5. **Auto-Fill Class Schedule:** Generate all weekly class sessions in bulk (e.g. Locking Fridays 8:00–10:00 PM).

### Step 2: Automated Registration & Incomplete Sheet Row Guard
1. Link the event's Google Sheet response spreadsheet in the Event Wizard.
2. The background engine checks the response sheet every 60 seconds (`AUTO_SYNC_SECONDS = 60`) with single-read optimizations.
3. **3-Layer Incomplete Sheet Row Guard:** Transient or half-filled rows created while dancers are actively submitting Google Forms are automatically ignored, preventing database corruption.
4. **10-Minute Form Status Sync:** Every 10 minutes, the backend verifies Google Form open/close state, auto-closing forms whose styles reach capacity and syncing manual edits.

### Step 3: Google Drive Folder Sharing & Class Rep Setup
1. Appoint a **Class Rep** for each dance style under **More › Admin Accounts** and assign their styles (`assignedStyleIds`).
2. The Class Rep creates a folder in their personal Google Drive (e.g. `Locking Videos 2026`) and shares it with `umdancesportc@gmail.com` as **Editor**.
3. In **Media › CLASS LEAD VIDEO DRIVE FOLDERS**, link the folder and authorize it under the Class Rep's Google account.

### Step 4: Live Attendance Taking & Walk-In Codes
1. Class Reps and instructors open `/admin/attendance` on their mobile phones.
2. Attendance ticks work seamlessly **offline**: if venue Wi-Fi drops, ticks queue locally and sync automatically when internet connectivity returns.
3. **Walk-In Class Codes:** Each class session generates a 7-character guest pass code (e.g. `LCK-7X9`). Guests can switch to **⚡ WALK-IN PASS** on the login screen to access recap videos and practice tracks immediately.

### Step 5: Recap Videos & Shared Music Library
1. Upload class choreography recap videos via **Media**. Choose **⚡ FAST: UPLOAD ORIGINAL** or **📦 SMALLER: COMPRESS FIRST** (client-side browser compression to 720p H.264).
2. **Consolidated Batch Email Notifications:** The system sends a single summary email (`videos.notifyBatch`) to enrolled dancers once an upload batch finishes.
3. **Shared Music Library (`/library`):** Upload MP3s or paste Spotify, YouTube, or SoundCloud links for specific classes or as `-- General Style / Event Library Track --`. All club members across all dance styles enjoy universal access to practice audio.

---

## 3. Deployment & Technical Maintenance

### A. Redeploying the Backend API (Google Apps Script)
If files in `api/` or `shared/` are updated:
```bash
# In the api workspace: builds TypeScript, pushes clasp code, and updates production deployment
npm run push -w api
```
The script deploys directly to deployment ID `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`. The production API URL remains immutable.

### B. Deploying Frontend Changes (Cloudflare Workers)
Frontend hosting runs on **Cloudflare Workers** with static asset hosting:
```bash
git checkout main
git merge <feature-branch>
git push origin main
```
Cloudflare automatically builds `web/` and serves `web/dist` per `wrangler.jsonc`. Live site updates occur within 60–90 seconds.

### C. Live Sandbox Verification
Verify live backend health and database isolation without touching production dancer records:
```bash
node scripts/live-sandbox-verify.mjs
```

---

## 4. Drive Storage Management

Free Google accounts provide 15 GB of storage.
- **Client-Side Video Compression**: The website automatically compresses videos exceeding 150 MB to 720p H.264 prior to upload.
- **Year-End Archiving**:
  1. Archive finished events via **Events › ARCHIVE**.
  2. Download historical video archives to external storage.
  3. Empty Google Drive Trash to permanently reclaim quota.

---

## 5. Adding & Managing Roles

To manage administrative access:
1. Navigate to **More › Roles & Permissions (`/admin/roles`)**.
2. Built-in roles:
   - **Admin (`admin`)**: Complete system access.
   - **Class Rep (`class_rep`)**: Pre-configured with `attendance.view.all`, `attendance.edit`, and `export.download`.
   - **Dancer (`dancer`)**: Calendar, shared library, studio, and profile.
3. Use the **Member Roles Panel** to scope Class Rep accounts to specific dance styles (`assignedStyleIds`). Dynamic UI navigation filters out unauthorized tabs automatically.

---

## 6. Documentation Directory & Detailed Guides

Complete operational guides in both **English** and **Chinese**, complete with downloadable Word `.docx` documents and embedded screenshots, are available in [`docs/guides/`](guides/README.md):

- [Guide Index & Summary](guides/README.md)
- [Class Lead & Class Rep Guide (EN)](guides/en/1-class-lead-guide.md) · [中文版](guides/zh/1-class-lead-guide.md)
- [Admin Guide (EN)](guides/en/2-admin-guide.md) · [中文版](guides/zh/2-admin-guide.md)
- [Dancer Guide (EN)](guides/en/3-dancer-guide.md) · [中文版](guides/zh/3-dancer-guide.md)
- [Admin Handover Guide (EN)](guides/en/4-admin-handover-guide.md) · [中文版](guides/zh/4-admin-handover-guide.md)
- [Developer & Technical Architecture Guide (EN)](guides/en/5-developer-guide.md) · [中文版](guides/zh/5-developer-guide.md)

Recompile all 10 Word guides at any time via:
```bash
node scripts/build-guide-docx.mjs
```

---

## 7. Important System References

- **Google Cloud IDs & Secret-Free Values**: [`docs/SETUP-VALUES.md`](SETUP-VALUES.md)
- **Spotify & YouTube Integration Guide**: [`docs/ENABLE-YOUTUBE-SEARCH.md`](ENABLE-YOUTUBE-SEARCH.md)
- **Design Specification**: [`docs/superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md`](superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md)
- **DanceCue Attribution**: [`CREDITS.md`](../CREDITS.md)
