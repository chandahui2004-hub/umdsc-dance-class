# Admin Handover Guide

**For:** the outgoing admin and the new admin, when the website changes hands (for example each new committee term).
**Read with:** the **Admin Guide** (daily use) and the **Developer Guide** (if anything needs changing in the code).

> 🔒 **Never write passwords in this guide, in GitHub, or in a group chat.** The GitHub repository is **public**. Hand passwords over in person or in a private message, and change them afterwards.

---

## 1. What runs the website

| Part | What it is | Where it lives | Signed in with |
|---|---|---|---|
| **Website** (what people see) | Pages hosted on Cloudflare | https://umdsc-dance-class.umdancesportc.workers.dev | Cloudflare account (club Gmail) |
| **Server** (logins, saving data) | Google Apps Script web app | script.google.com, project of the club account | **umdancesportc@gmail.com** |
| **Database** | A Google Sheet in the club's Drive | System Settings › **Database Folder** | **umdancesportc@gmail.com** |
| **Google sign-in + Drive access** | Google Cloud project **umdsc-class** | console.cloud.google.com | **umdancesportc@gmail.com** |
| **Source code** | GitHub repository | https://github.com/chandahui2004-hub/umdsc-dance-class | GitHub account of the owner |
| **Class videos** | Each class lead's own Google Drive folder | Linked on the Media page | Each class lead |

Almost everything belongs to the **club Gmail, `umdancesportc@gmail.com`**. Whoever controls that account controls the system.

---

## 2. Handover checklist

### Outgoing admin
- [ ] Hand over the **club Gmail password** privately. Make sure 2-Step Verification uses a phone or backup codes the new admin can access.
- [ ] Create a website account for the new admin: **Admin Accounts › + NEW ADMIN**, role **Admin**.
- [ ] Give the new admin access to the **source code** on GitHub, using one of these:
  - **Recommended:** transfer the repository to a GitHub account the club controls: Repository › **Settings › General › Transfer ownership**.
  - Or add them as a collaborator: Repository › **Settings › Collaborators › Add people**.
- [ ] Make sure the new admin can sign in to **Cloudflare** (dash.cloudflare.com) with the club Gmail.
- [ ] Walk through the **Admin Guide** together, and do one class's attendance and one upload together.

### New admin
- [ ] Log in to the website with **your own** admin account.
- [ ] **Change the club Gmail password**, and update its 2-Step Verification.
- [ ] **DEACTIVATE** the old admin's website account, unless they stay to help.
- [ ] Check every class lead still has an account, a folder link and an upload account (section 4).
- [ ] Review the **Google sign-in list** (section 4, step C): remove people who left.

---

## 3. Regular tasks

| When | Task | Where |
|---|---|---|
| Every month | Create the new **event** with its Google Form | Events › + NEW EVENT |
| Every month | **ARCHIVE** last month's event when it's over | Events |
| When needed | Check new registrations have arrived (**SYNC NOW**) | Events |
| When needed | Add or change instructors, styles and classes | Admin Guide sections 3–5 |
| Each term | Add or remove class leads | Section 4 below |
| Each term | Check the class leads' Google storage isn't full | Each lead's Google account |

---

## 4. Add a new class lead (step by step)

Do steps A–C yourself; steps D–F need the class lead.

**A. Make sure the Class Lead role exists (once only)**
Roles & Permissions. If there's no **Class Lead** role, create it as in the **Admin Guide, section 8**: **Login Type Admin**, plus the listed permissions, including `styles.edit`.

**B. Create their website account**
1. **Admin Accounts › + NEW ADMIN.**
2. **Username:** for example `locking.lead`. **Display Name:** for example `Locking Class Lead`. **Initial Password:** a strong temporary password. **Assigned Role:** **Class Lead**.
3. Send the username and password to them **privately**.

**C. Add their Gmail to the Google sign-in list**
The website's Google sign-in is in Google's "Testing" mode, so **only listed Gmail accounts can sign in**.
1. Go to https://console.cloud.google.com, signed in as **umdancesportc@gmail.com**. Check the project at the top is **umdsc-class**.
2. Search **Google Auth Platform**, then open **Audience**.
3. Under **Test users**, click **+ Add users**, enter the class lead's Gmail, then **Save**. Up to 100 people can be listed.

**D. The class lead creates and shares a Drive folder**
1. In **their** Google Drive: **New › Folder**, for example `Locking Class Videos`.
2. **Share** it with `umdancesportc@gmail.com` as **Editor**. Under **General access**, keep it **Restricted**, not "Anyone with the link".
3. They send you the folder link.

**E. Insert the folder link**
**Media › CLASS LEAD VIDEO DRIVE FOLDERS › ▼ EXPAND**. On their style's row, click **+ INSERT LINK**, paste the link, then **SAVE**.

**F. The class lead authorizes the folder 💻**
The class lead, on a computer, logs in with their website account, opens **Media**, taps **SWITCH ACCOUNT** to choose **their own Gmail**, then taps **AUTHORIZE** on their style and selects the folder. The row shows **✓ AUTHORIZED** and **Uploads as** *their Gmail*.

✅ Done. They can now take attendance and upload; give them the **Class Lead Guide**.

### When a class lead leaves
1. **Admin Accounts:** **DEACTIVATE** their account.
2. **Media:** **REMOVE LINK** for their style, or **CHANGE LINK** to the new lead's folder.
3. **Google Cloud › Audience › Test users:** remove their Gmail.
4. Ask them **not to delete** the old video folder until the new lead has copied anything worth keeping.

---

## 5. Common problems

| Problem | Cause and fix |
|---|---|
| A dancer can't log in | The name must match the registration form, every word. Check them on the **Dancers** page. If they're missing, check the form response sheet, then **SYNC NOW**. |
| "Access blocked" / Google refuses sign-in when uploading | Their Gmail isn't on the **Test users** list (4C). |
| "…uploads with X, but you're signed in as Y" | They're signed in with the wrong Google account: **SWITCH ACCOUNT**. |
| "…has no upload account yet" | Do step **4F** (AUTHORIZE). |
| "Class lead video folder link not inserted" | Do step **4E**. |
| A deleted video is still in Drive | The website could only remove it from the website, because another account owns the file. Delete it in Drive by hand. |
| "Session expired due to permission update" | Someone changed a role's permissions. Log in again. |
| New events don't import dancers | The response sheet isn't shared with umdancesportc@gmail.com as Editor, or the event is archived. |
| The website looks out of date | Close the tab and open it again. |
| Something is broken in the code | See the **Developer Guide**. |
