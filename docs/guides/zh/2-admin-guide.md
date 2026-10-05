# 管理员使用指南

**适用对象：**负责管理网站的社团干部。
**网站：**https://umdsc-dance-class.umdancesportc.workers.dev/admin/login
**请使用笔记本或台式电脑。**所有管理页面在手机上也能用，但设置资料时大屏幕更方便。

> 网站界面是英文的，本指南中的**按钮名称保留英文**。

管理员能做课程负责人能做的所有事情（点名和上传请看**课程负责人使用指南**）。本指南讲的是如何设置和管理社团资料。

---

## 1. 登录与导航

在 **/admin/login** 输入你的**用户名**和**密码**，点 **LOGIN**。

左侧菜单有 **Calendar（日历）、Attendance（点名）、Media（媒体）、Dancers（舞者）**，在 **More（更多）**下还有：**Dance Styles（舞种）、Instructors（老师）、Roles & Permissions（角色与权限）、Admin Accounts（管理员账号）、System Settings（系统设置）、Events（活动）**。

页面顶部的 **EVENT:** 用来选择所有页面要显示的活动（月份）。

![日历](../images/admin-01-calendar.png)

---

## 2. Events 活动：每个月度课程、体验课或工作坊各一个

每个活动都有**自己的 Google 报名表**。填写报名表的舞者会被自动导入。

![活动](../images/admin-02-events.png)

### 新建活动

**开始之前：**
- 建好这个活动的 **Google 表格（Form）**，并连接到一个**回复表格（response sheet）**。
- **把回复表格以编辑者（Editor）身份共享给 `umdancesportc@gmail.com`。**网站不接受它无法编辑的链接。
- 确认表格里有一个让舞者选择课程的问题。

然后点 **Events › + NEW EVENT**，完成 5 个步骤：

1. **FORM LINK**：粘贴 **Google 表格回复表格的链接**，然后选择 **Class choice** 栏位，也就是表格中让舞者选课的那个问题。
2. **DETAILS**：**Event name**（活动名称，例如 `NOV MONTHLY CLASS`）、**Event type**（活动类型）、**Start day**（开始日期）和 **End day**（结束日期）。
3. **STYLES**：勾选这个活动教的舞种。如果表格里有些选课答案对不上任何舞种，向导会把它们列在 **CLASS ANSWERS THAT MATCH NO STYLE** 下。解决方法是给舞种加一个**别名（alias）**（见第 3 节）。
4. **SCHEDULE**：每个舞种用 **AUTO-FILL**（填写星期几、开始时间、结束时间、上课次数）一次生成所有课程，需要的话再个别调整日期。
5. **REVIEW**：检查所有资料，然后建立活动。

![新建活动向导](../images/admin-03-new-event.png)

### 管理活动

- **SYNC NOW**：立即导入新的报名资料（系统也会自动同步）。
- **EDIT**：修改资料、舞种或课程表。
- **ARCHIVE**：一个月结束后就归档。归档后的活动不再同步，并移到 **ARCHIVED EVENTS** 下。

---

## 3. Dance Styles 舞种

**More › Dance Styles**。每个舞种（Hip Hop、Popping、Locking、Latin…）有：

| 栏位 | 意思 |
|---|---|
| **Style Name** | 舞种名称，到处都会显示 |
| **Aliases (comma-separated)** | 别名，用逗号分隔。舞者在表格中可能的其他写法，例如 `hiphop, hip-hop`，用来把报名答案对应到这个舞种 |
| **Color Swatch** | 舞种在日历上的颜色 |
| **Default Day / Start Time / End Time / Default Instructor / Default Venue** | 默认星期、开始/结束时间、默认老师、默认地点，生成课程时使用 |
| **Attendance Folder Link / Video Folder Link** | 这个舞种的点名/视频 Drive 文件夹（选填） |

![舞种列表](../images/admin-04-styles.png)
![舞种表单](../images/admin-05-style-form.png)

---

## 4. Instructors 老师

**More › Instructors › + NEW INSTRUCTOR**。填写 **Full Name**（全名）、**Contact (Phone / WhatsApp)**（联络电话）和 **Instructor Signature Color**（老师代表色）。用 **+ UPLOAD PICTURE** 上传照片（建议 1080 × 1350 直式），或用 **+ LINK URL** 填入网上照片的链接。可以保存多张照片，标示 **ACTIVE** 的那张会显示给舞者看。

![老师列表](../images/admin-06-instructors.png)
![老师表单](../images/admin-07-instructor-form.png)

---

## 5. 课程（日历）

**Calendar** 显示所选活动的所有课程，可以按**舞种**或**老师**筛选。
- 点一堂课，可以修改**日期**、**地点**、**老师**（或**代课老师 replacement**）以及**备注**。课程状态可以设为 **scheduled**（已排课）、**replacement**（代课）或 **cancelled**（取消）。
- 要加开一堂课，选择新课程的**活动**和**舞种**后添加。

---

## 6. Dancers 舞者

**Dancers** 列出所选活动的所有报名舞者：**学号、全名、联络电话、电邮、性别**及所报的课程。用 **Search name, matric, phone…** 搜索。

![舞者列表](../images/admin-08-dancers.png)

> 舞者资料来自 Google 报名表。要修改名字，请在**报名回复表格**里改正，再点 **SYNC NOW**。

---

## 7. Media 媒体：课程负责人视频文件夹

**Media › CLASS LEAD VIDEO DRIVE FOLDERS**。每个舞种的视频会上传到该舞种**课程负责人自己的 Google Drive 文件夹**。

![媒体](../images/admin-09-media.png)

每个舞种可以：
- **+ INSERT LINK / CHANGE LINK**：填入或更换课程负责人的文件夹链接。文件夹必须**以编辑者（Editor）身份共享给 `umdancesportc@gmail.com`**。
- **REMOVE LINK**：移除文件夹链接。在填入新链接之前，这个舞种无法上传；已经在 Drive 里的视频不受影响。
- **AUTHORIZE**：把文件夹和一个 **Google 账号**绑定。之后这个舞种的上传**必须**用那个账号，并占用那个账号的存储空间。点 AUTHORIZE 之前，先用 **SWITCH ACCOUNT** 选择**课程负责人的** Gmail。这一行会显示 **Uploads as** *那个 Gmail*。

上传视频和音乐也在这个页面，请看课程负责人使用指南。

---

## 8. Roles & Permissions 角色与权限

**More › Roles & Permissions**。**角色（role）**就是一组权限。系统内置两个：**Admin**（所有权限）和 **Dancer**（日历、自己的出席记录、视频、音乐）。

![角色](../images/admin-10-roles.png)

### 课程负责人角色（只需建立一次）

1. **+ NEW ROLE**：**Role Name** 填 `Class Lead`，**Login Type 选 `Admin`**，然后 **SAVE ROLE**。
   > 一定要选 **Admin** 登录类型。Dancer 类型的账号打不开 Attendance 和 Media 页面。
2. 点 **MANAGE PERMISSIONS**，勾选：
   `calendar.view`、`attendance.view.all`、`attendance.edit`、`export.download`、`members.view`、`videos.view`、`videos.upload`、`videos.edit`、`music.view`、`music.edit`、`sections.edit`，以及 **`styles.edit`**。最后一项让课程负责人能自己 AUTHORIZE 文件夹，同时也允许他们修改舞种资料。
3. 点 **SAVE PERMISSIONS**。

绝对不要把 `settings.edit`、`admins.manage` 或 `roles.manage` 给课程负责人。

> 修改角色权限后，拥有该角色的人都需要重新登录。

---

## 9. Admin Accounts 管理员账号

**More › Admin Accounts › + NEW ADMIN**。为每位管理员和课程负责人建立账号：**Username**（用户名）、**Display Name**（显示名称）、**Initial Password**（初始密码）、**Assigned Role**（角色）。用户名和密码要**私下**发送，例如私讯，绝对不要发在群组里。

- **忘记密码：**在他的账号点 **RESET PASSWORD**，输入 **New Password**（新密码），再点 **UPDATE PASSWORD**。
- **有人离开：**点 **DEACTIVATE** 停用他的账号。

![管理员账号](../images/admin-12-admin-accounts.png)
![新增管理员账号](../images/admin-13-new-admin-account.png)

> 新增课程负责人的完整步骤（账号、Google 登录名单、文件夹）在**管理员交接指南**第 4 节。

---

## 10. System Settings 系统设置

**More › System Settings**。

| 设置 | 意思 |
|---|---|
| **Database Folder** | 存放网站数据库（一个 Google Sheet）的 Google Drive 文件夹。不要删除。 |
| **Default Attendance Folder** | 点名表建立的位置。也显示在 **Attendance** 页面。 |
| **Link Update History** | 谁在什么时候改了哪个文件夹链接。 |
| **Data Retention (3 years)** | 超过 3 年的旧资料会被清除。 |
| **Reset Test Data** | ⚠️ 只在正式启用前使用：会删除测试资料，需要输入确认文字。 |

![系统设置](../images/admin-14-settings.png)
