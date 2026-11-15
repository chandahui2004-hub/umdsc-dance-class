# Admin Handover & Operations Guide

**For:** Outgoing and incoming club executive committees when system stewardship changes hands (e.g. at annual committee transitions).  
**Companion guides:**  
- [Admin Guide](2-admin-guide.md) (day-to-day administrative operations)  
- [Class Lead Guide](1-class-lead-guide.md) (attendance taking and media uploads)  
- [Developer Guide](5-developer-guide.md) (source code and deployment instructions)  

> 🔒 **Security Imperative:** The GitHub repository is public. **Never commit passwords, Google account credentials, `TOKEN_SECRET`, `.admin-token`, or personal phone numbers into this repository or in group chats.** Always transmit credentials in person or through end-to-end encrypted direct messages, and rotate them immediately after handover.

---

## 1. System architecture summary

| Component | Technology | Location / Hosting | Admin Credentials |
|---|---|---|---|
| **Website Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 | Cloudflare Workers Static Assets (`https://umdsc-dance-class.umdancesportc.workers.dev`) | Cloudflare Account (`umdancesportc@gmail.com`) |
| **Backend API** | Google Apps Script (TypeScript bundled to `Code.js`) | Apps Script Web App Deployment ID `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA` | `umdancesportc@gmail.com` |
| **Database** | Google Sheets (`UMDSC_System` multi-tab spreadsheet) | Google Drive root folder `UMDSC_System` | Owned by `umdancesportc@gmail.com` |
| **Registration Engine** | Google Forms & Response Sheets with Slot Auto-Gating | Created per monthly event; linked via Event Wizard | Form & Sheet shared with `umdancesportc@gmail.com` as **Editor** |
| **Video Storage** | Hybrid Google Drive & YouTube Unlisted | Individual Class Lead Drive Folders + YouTube Studio | Class Lead personal Google accounts |
| **Music Library** | Shared Music Library & Audio Streamer | Drive files & YouTube/Spotify/SoundCloud streams | Managed in System Media & Music Library |
| **Source Code** | Git monorepo (`web/`, `api/`, `shared/`, `scripts/`) | [https://github.com/chandahui2004-hub/umdsc-dance-class](https://github.com/chandahui2004-hub/umdsc-dance-class) | GitHub repository maintainers |

Primary ownership of all operational assets resides with the **club Google account, `umdancesportc@gmail.com`**. Securing and transferring this account guarantees continuous control of the club platform.

---

## 2. Handover checklist

### Outgoing Executive Committee
- [ ] **Transfer Club Gmail Credentials:** Hand over the password for `umdancesportc@gmail.com` privately. Update 2-Step Verification phone numbers and generate new emergency backup codes for the incoming committee.
- [ ] **Create New Admin Accounts:** In **Admin Accounts › + NEW ADMIN**, create individual administrator accounts for incoming executive members under the **Admin** role.
- [ ] **Transfer GitHub Access:** Add incoming technical directors as repository collaborators or transfer ownership under **GitHub › Repository Settings › Collaborators**.
- [ ] **Transfer Cloudflare Access:** Ensure the new tech leads can sign in to Cloudflare dashboard under `umdancesportc@gmail.com`.
- [ ] **System Settings Walkthrough:** Guide the new committee through **System Settings**, including **Admin Notification Emails** and folder links.
- [ ] **Live Class Rehearsal:** Run a mock attendance session and video upload with the new team.

### Incoming Executive Committee
- [ ] **Rotate Club Gmail Password:** Immediately change the password for `umdancesportc@gmail.com` and update recovery emails.
- [ ] **Update Admin Notification Emails:** In **System Settings › ADMIN NOTIFICATION EMAILS**, add the incoming committee's emails to receive real-time capacity and auto-gating alerts.
- [ ] **Deactivate Departed Accounts:** In **Admin Accounts**, click **DEACTIVATE** for outgoing committee members who no longer require administrative privileges.
- [ ] **Verify Class Rep Onboarding:** Confirm every dance style has an appointed Class Rep with assigned dance styles (`assignedStyleIds`).
- [ ] **Audit Google Cloud Test Users:** Open Google Cloud Console (`umdsc-class`) › Google Auth Platform › Audience, and verify the OAuth test user list matches active class leads.

---

## 3. Recurring operational schedule

| Cadence | Operational Task | Location | Notes |
|---|---|---|---|
| **Monthly** | Create new Event via Event Wizard | Events › **+ NEW EVENT** | Enter Google Form edit URL (`formUrl`) for slot auto-gating and response sheet link. |
| **Monthly** | Monitor style slot limits & registrations | Events & Notification Mascot | Form auto-closes when capacity is reached; 1-min throttled sync runs automatically. |
| **Monthly** | Archive previous month's event | Events › **ARCHIVE** | Freezes data and stops background sync jobs. |
| **Weekly** | Supervise class attendance | Attendance | Verify class leads submitted ticks; export Excel for club records. |
| **Per Term** | Onboard or rotate Class Reps | Roles & Admin Accounts | Seed accounts with built-in `Class Rep` role scoped to their styles. |
| **Annually** | Audit Google Drive storage quota | Google Drive | Verify video folders are kept within free tier limits. |

---

## 4. Onboarding a new Class Rep (step-by-step)

Steps A–C are performed by an administrator; steps D–F are completed by the Class Rep.

### Step A: Verify the Class Rep system role
In **Roles & Permissions**, confirm the built-in system role **Class Rep (`role_class_rep`)** exists. It comes pre-configured with `attendance.view.all`, `attendance.edit`, and `export.download`.

### Step B: Create their administrative account
1. Open **Admin Accounts › + NEW ADMIN**.
2. **Username:** e.g. `locking.rep`.
3. **Display Name:** e.g. `Locking Class Rep`.
4. **Assigned Role:** Select **Class Rep**.
5. **Assigned Dance Styles (`assignedStyleIds`):** In the **Member Roles Panel** in Roles, scope their access to their assigned style (e.g. *Locking*). Unrelated administrative tabs will automatically be hidden from their view.
6. Provide their temporary credentials in a private message.

### Step C: Add their Gmail to Google Cloud OAuth test users
Because Google sign-in is operated in project verification test mode:
1. Open [https://console.cloud.google.com](https://console.cloud.google.com) signed in as `umdancesportc@gmail.com`.
2. Select project **umdsc-class**.
3. Navigate to **Google Auth Platform › Audience**.
4. Under **Test users**, click **+ Add users**, enter the Class Rep's personal Gmail address, and click **Save**.

### Step D: The Class Rep creates their video folder
1. In their personal Google Drive, the Class Rep creates a folder (e.g. `Locking Recap Videos 2026`).
2. They click **Share**, set `umdancesportc@gmail.com` as **Editor**, and leave general access **Restricted**.
3. They copy the folder URL and send it to the admin.

### Step E: Administrator registers the folder link
In **Media › CLASS LEAD VIDEO DRIVE FOLDERS › ▼ EXPAND**, find their dance style row, click **+ INSERT LINK**, paste the URL, and save.

### Step F: The Class Rep authorizes their folder 💻
On a computer browser:
1. The Class Rep logs in to the website.
2. Opens **Media**, taps **SWITCH ACCOUNT**, and selects their personal Gmail.
3. On their dance style row, taps **AUTHORIZE**, picks their folder in the Google Picker window, and clicks **Select**.
4. The row updates to **✓ AUTHORIZED** with **Uploads as** *their Gmail*.

---

## 5. Troubleshooting & operational solutions

| Symptom | Probable Cause | Action / Resolution |
|---|---|---|
| **Google Form shows "No longer accepting responses" prematurely** | Style slot limit reached in the system | Check **Events › Edit Event › Per-Style Slot Limits**. If additional venue capacity is available, increase the slot limit. The system will automatically reopen the form. |
| **New form responses do not appear in the website roster** | Transient row caught by Incomplete Sheet Row Guard, or 60s throttle | Ensure the dancer completed all required form fields (Full Name, Matric). Incomplete rows are safely ignored to prevent database corruption. Wait 60 seconds or click **SYNC NOW** in Events. |
| **"Access blocked / Sign-in with Google disabled" during video upload** | Class Rep's Gmail not registered in Google Cloud | Add the user's Gmail to the **Test users** list in Google Cloud Console under project `umdsc-class` (Section 4C). |
| **"Uploads with X, but you are signed in as Y"** | Active Google session mismatch | Tap **SWITCH ACCOUNT** in the top navigation bar and select Google account X. |
| **Class Rep sees unauthorized administrative tabs or cannot see attendance** | Permissions not refreshed or role misconfigured | Ensure their account is assigned to the built-in **Class Rep** role and assigned to the correct style in **Roles & Permissions**. Have them log out and log back in. |
| **Dancer cannot find songs for other styles in the library** | Incorrect route or filter applied | The **Shared Music Library (`/library`)** grants universal access across all styles. Check the Dance Style filter pills at the top to ensure "All" is selected. |
| **Video upload stalls or fails at 99%** | Phone went to sleep during upload | Keep the browser tab active and screen awake. Use **📦 SMALLER: COMPRESS FIRST** for files over 150 MB. |
| **Dancer self-service edit fails with "Matric already belongs to another dancer"** | Duplicate student ID entered | The system enforces unique matric keys. Verify student identity and update directly via **Dancers › EDIT DANCER** if necessary. |
