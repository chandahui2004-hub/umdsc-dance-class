# UMDSC Dance Class System — Club Handover & Operations Guide

Welcome to the operations manual for the **UMDSC Dance Class System**. This document outlines how the system operates, maintenance procedures, and instructions for incoming club executive committees.

---

## 1. Club Gmail & Ownership Handover

- **System Gmail**: `umdancesportc@gmail.com`
- **Ownership Scope**:
  - Owns the primary Google Drive Database folder (`UMDSC_System` and subfolders).
  - Owns the Google Apps Script Web App backend deployment.
  - Owns Google Cloud Platform project `umdsc-class`.
- **Security Rule**:
  - Never store or commit the password in this repository or in any code file.
  - Handover to incoming committee:
    1. Transfer Google Account 2FA recovery phone and recovery email to the new Vice President / Secretary.
    2. Review connected apps at [myaccount.google.com/connections](https://myaccount.google.com/connections).
    3. Ensure at least two executive committee members know the primary credentials and have physical security keys/2FA.

---

## 2. Monthly Executive Routine

Every monthly class follows this simple 5-step operational workflow:

### Step 1: Create Month / Event & Generate Sessions
1. Navigate to **Calendar / Events** as an Admin.
2. Click **Add Event / New Month** (e.g. `2026-11 Monthly Classes`).
3. Set start/end dates and selected dance styles (Locking, Popping, Hip Hop, Latin).
4. Auto-generate sessions according to standard schedule slots (e.g. Locking Fridays 8-10pm, etc.).

### Step 2: Import Registrations from Google Form
1. Open **Members → Import**.
2. Paste the Google Form spreadsheet response link for the month.
3. Review column mapping preview (Full Name, Matric No, Dance Styles, Phone/Contact).
4. Click **Confirm Import**: The system registers members and issues permissions automatically.

### Step 3: Google Drive Folders & Sharing
1. Share the monthly Attendance Google Sheet with class instructors / PICs as Editor.
2. Ensure dancer video folders are set up with public read access or view links.

### Step 4: Live Attendance Taking
- PICs and instructors open the website on their phones (`/admin/attendance` or `/attendance`).
- Ticks sync instantly and work **offline**: if Wi-Fi drops, ticks queue locally and sync automatically when connectivity returns.

### Step 5: Recap Videos & Music
- Upload class choreography recap videos directly from mobile or PC via **Media**.
- Add MP3s or YouTube tracks for practice in the **Music Studio**.

---

## 3. Deployment & Technical Maintenance

### A. Redeploying the Backend API (Google Apps Script)
If backend API code or database schema is modified:
```bash
# 1. Build and push to Google Apps Script
npm run push -w api

# 2. Update the active web app deployment (URL never changes)
npx clasp update-deployment AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA -w api
```

### B. Deploying Frontend Changes (Cloudflare Pages)
- Frontend is hosted on **Cloudflare Pages**.
- Continuous Deployment is active: pushing commits to branch `main` automatically triggers a production build:
```bash
git checkout main
git merge <feature-branch>
git push origin main
```
- Build command: `npm run build -w web`
- Output directory: `web/dist`

---

## 4. Drive Storage Management

Free Google accounts provide 15 GB of storage.
- **Video Compression**: Instruct admins to upload 720p compressed MP4s (H.264/AAC, typically 20–60 MB per recap video) rather than 4K camera raw files.
- **Archiving**: At the end of each academic year:
  1. Archive past year events from **Events → Archive**.
  2. Backup older video recordings to an external hard drive or club archive Drive.
  3. Delete raw videos from Google Drive trash to free up quota.

---

## 5. Adding & Managing Roles

To add or modify administrative roles:
1. Navigate to **Admin → Roles & Permissions** (`/admin/roles`).
2. Click **Add Role** (e.g. `Choreographer`, `Treasurer`, `Class PIC`).
3. Select exact granular permissions:
   - `attendance.edit` / `attendance.view.all`
   - `videos.upload` / `videos.edit`
   - `music.edit` / `sections.edit`
   - `members.import` / `members.view`
4. Assign users to the new role in **Admin Users**.

---

## 6. Important System References

- **Google Cloud IDs & Secret-Free Values**: [`docs/SETUP-VALUES.md`](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/docs/SETUP-VALUES.md)
- **Design Specification**: [`docs/superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md`](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/docs/superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md)
- **DanceCue Attribution**: [`CREDITS.md`](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/CREDITS.md)
