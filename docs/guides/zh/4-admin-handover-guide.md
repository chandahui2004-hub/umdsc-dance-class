# 管理员交接指南

**适用对象：**网站换人管理时（例如每届新干部）的卸任管理员和新任管理员。
**一起阅读：****管理员使用指南**（日常操作）和**开发者指南**（如需修改程序）。

> 🔒 **不要把密码写在本指南、GitHub 或群组里。**GitHub 仓库是**公开的**。密码请当面或私讯交接，交接后立即更改。

> 网站界面是英文的，本指南中的**按钮名称保留英文**。

---

## 1. 网站由哪些部分组成

| 部分 | 是什么 | 在哪里 | 用哪个账号登录 |
|---|---|---|---|
| **网站**（大家看到的页面） | 放在 Cloudflare 上的网页 | https://umdsc-dance-class.umdancesportc.workers.dev | Cloudflare 账号（社团 Gmail） |
| **服务器**（登录、保存资料） | Google Apps Script 网页应用 | script.google.com，社团账号的项目 | **umdancesportc@gmail.com** |
| **数据库** | 社团 Drive 里的一个 Google Sheet | System Settings › **Database Folder** | **umdancesportc@gmail.com** |
| **Google 登录 + Drive 权限** | Google Cloud 项目 **umdsc-class** | console.cloud.google.com | **umdancesportc@gmail.com** |
| **源代码** | GitHub 仓库 | https://github.com/chandahui2004-hub/umdsc-dance-class | 仓库拥有者的 GitHub 账号 |
| **课程视频** | 各课程负责人自己的 Google Drive 文件夹 | 在 Media 页面填入的链接 | 各课程负责人 |

几乎所有东西都属于**社团 Gmail `umdancesportc@gmail.com`**。谁掌握这个账号，谁就掌握整个系统。

---

## 2. 交接清单

### 卸任管理员
- [ ] **私下**交接**社团 Gmail 密码**，并确认两步验证使用的手机或备用验证码，新管理员也能用。
- [ ] 为新管理员建立网站账号：**Admin Accounts › + NEW ADMIN**，角色选 **Admin**。
- [ ] 让新管理员能使用 GitHub 上的**源代码**，两种方法选一种：
  - **建议：**把仓库转移到社团掌握的 GitHub 账号：仓库 › **Settings › General › Transfer ownership**。
  - 或把他加为协作者：仓库 › **Settings › Collaborators › Add people**。
- [ ] 确认新管理员能用社团 Gmail 登录 **Cloudflare**（dash.cloudflare.com）。
- [ ] 和新管理员一起看一遍**管理员使用指南**，并一起完成一次点名和一次上传。

### 新任管理员
- [ ] 用**你自己的**管理员账号登录网站。
- [ ] **更改社团 Gmail 密码**，并更新两步验证。
- [ ] **DEACTIVATE** 停用前任管理员的网站账号（除非他留下来帮忙）。
- [ ] 检查每位课程负责人都有账号、文件夹链接和上传账号（见第 4 节）。
- [ ] 检查 **Google 登录名单**（第 4 节步骤 C），移除已经离开的人。

---

## 3. 定期工作

| 时间 | 工作 | 位置 |
|---|---|---|
| 每个月 | 建立新**活动**和对应的 Google 报名表 | Events › + NEW EVENT |
| 每个月 | 上个月结束后**ARCHIVE**（归档）上个月的活动 | Events |
| 需要时 | 确认新报名已导入（**SYNC NOW**） | Events |
| 需要时 | 新增或修改老师、舞种和课程 | 管理员使用指南第 3–5 节 |
| 每学期 | 新增或移除课程负责人 | 下面第 4 节 |
| 每学期 | 检查课程负责人的 Google 存储空间是否已满 | 各负责人的 Google 账号 |

---

## 4. 新增课程负责人（逐步说明）

步骤 A–C 由你完成；步骤 D–F 需要课程负责人配合。

**A. 确认已有 Class Lead 角色（只需一次）**
到 Roles & Permissions。如果没有 **Class Lead** 角色，按**管理员使用指南第 8 节**建立：**Login Type 选 Admin**，加上列出的权限，包括 `styles.edit`。

**B. 建立他的网站账号**
1. **Admin Accounts › + NEW ADMIN**。
2. **Username** 例如 `locking.lead`；**Display Name** 例如 `Locking Class Lead`；**Initial Password** 设一个强的临时密码；**Assigned Role** 选 **Class Lead**。
3. **私下**把用户名和密码发给他。

**C. 把他的 Gmail 加入 Google 登录名单**
网站的 Google 登录目前是 Google 的“测试（Testing）”模式，**只有名单上的 Gmail 才能登录**。
1. 用 **umdancesportc@gmail.com** 登录 https://console.cloud.google.com，确认顶部的项目是 **umdsc-class**。
2. 搜索 **Google Auth Platform**，打开 **Audience**。
3. 在 **Test users** 下点 **+ Add users**，输入课程负责人的 Gmail，然后 **Save**。最多可以加 100 人。

**D. 课程负责人建立并共享 Drive 文件夹**
1. 在**他自己的** Google Drive：**新建 › 文件夹**，例如 `Locking Class Videos`。
2. **共享**给 `umdancesportc@gmail.com`，权限选**编辑者（Editor）**。“一般访问权限”保持**受限（Restricted）**，不要选“知道链接的任何人”。
3. 把文件夹链接发给你。

**E. 填入文件夹链接**
**Media › CLASS LEAD VIDEO DRIVE FOLDERS › ▼ EXPAND**。在他舞种的那一行点 **+ INSERT LINK**，粘贴链接，再点 **SAVE**。

**F. 课程负责人授权文件夹 💻**
课程负责人用电脑以他的网站账号登录，打开 **Media**，点 **SWITCH ACCOUNT** 选择**他自己的 Gmail**，然后在他舞种那一行点 **AUTHORIZE** 并选择文件夹。这一行会显示 **✓ AUTHORIZED** 以及 **Uploads as** *他的 Gmail*。

✅ 完成！他现在可以点名和上传了，把**课程负责人使用指南**发给他。

### 课程负责人离开时
1. **Admin Accounts**：**DEACTIVATE** 停用他的账号。
2. **Media**：他舞种的那一行点 **REMOVE LINK**，或用 **CHANGE LINK** 换成新负责人的文件夹。
3. **Google Cloud › Audience › Test users**：移除他的 Gmail。
4. 请他在新负责人复制好需要保留的视频之前，**不要删除**旧的视频文件夹。

---

## 5. 常见问题

| 问题 | 原因与解决 |
|---|---|
| 舞者无法登录 | 名字必须和报名表一致，每个部分都要有。在 **Dancers** 页面找他。找不到的话，检查报名回复表格，再 **SYNC NOW**。 |
| 上传时 Google 显示 “Access blocked”（访问被阻止）或拒绝登录 | 他的 Gmail 不在 **Test users** 名单上（步骤 4C）。 |
| “…uploads with X, but you're signed in as Y” | 登录了错误的 Google 账号：点 **SWITCH ACCOUNT**。 |
| “…has no upload account yet” | 完成步骤 **4F**（AUTHORIZE）。 |
| “Class lead video folder link not inserted” | 完成步骤 **4E**。 |
| 已删除的视频还在 Drive 里 | 文件属于另一个账号，网站只能把它从网站移除。请在 Drive 手动删除。 |
| “Session expired due to permission update” | 有人修改了角色权限，重新登录即可。 |
| 新活动没有导入舞者 | 回复表格没有以编辑者身份共享给 umdancesportc@gmail.com，或活动已归档。 |
| 网站看起来是旧版本 | 关闭网页标签，再重新打开。 |
| 程序出错 | 请看**开发者指南**。 |
