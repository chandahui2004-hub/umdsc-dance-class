# 管理员交接与运维指南 (Admin Handover Guide)

**适用对象：**社团执委会换届时，卸任与新任系统管理员的交接流程与运维规范。  
**配套参考文档：**  
- [管理员使用指南 (Admin Guide)](2-admin-guide.md)（日常后台运维与管理操作）  
- [课程负责人使用指南 (Class Lead Guide)](1-class-lead-guide.md)（点名与媒体上传指引）  
- [开发者指南 (Developer Guide)](5-developer-guide.md)（代码仓库架构与部署维护）  

> 🔒 **核心安全守则：** 本 GitHub 仓库完全对外公开。**严禁在代码、说明文档、Issue 或任何群聊中写入密码、Google 账号密码、`TOKEN_SECRET`、`.admin-token` 或个人电话！** 所有凭据交接必须当面或通过端到端加密私聊完成，并在交接后第一时间修改。

---

## 1. 系统核心资产一览表

| 资产名称 | 技术实现 | 运行环境与域名 | 归属与凭据账号 |
|---|---|---|---|
| **前端静态网站** | React 19, TypeScript, Vite, Tailwind CSS v4 | Cloudflare Workers 静态资产 (`https://umdsc-dance-class.umdancesportc.workers.dev`) | Cloudflare 账号 (`umdancesportc@gmail.com`) |
| **后端 API 服务** | Google Apps Script (TypeScript 编译为 `Code.js`) | 部署 ID `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA` | `umdancesportc@gmail.com` |
| **主数据库** | Google Sheets 多工作表架构 (`UMDSC_System`) | Google Drive 根目录 `UMDSC_System` | 归属 `umdancesportc@gmail.com` |
| **报名与满额关停引擎** | Google Forms 与响应表格自动联动 | 各月活动表单；在活动向导中对接 | 表单与响应表均以 **Editor** 共享给 `umdancesportc@gmail.com` |
| **课程视频存储** | 云端硬盘原画/压缩 + YouTube 不公开双模存储 | 课程负责人个人 Google Drive 文件夹与 YouTube Studio | 课程负责人个人 Google 账号 |
| **共享音乐库** | 全社团跨舞种互通音乐库 | 舞种云端硬盘目录与外链音频流 | 系统 Media 页面统一管理 |
| **源代码仓库** | Git Monorepo 代码库 (`web/`, `api/`, `shared/`, `scripts/`) | [https://github.com/chandahui2004-hub/umdsc-dance-class](https://github.com/chandahui2004-hub/umdsc-dance-class) | GitHub 仓库协作者 |

社团所有核心资产均锚定在**社团官方 Google 账号：`umdancesportc@gmail.com`** 上。交接该账号的绝对控制权即可确保整个技术系统的稳定延续。

---

## 2. 换届交接核对清单

### 卸任执委工作清单
- [ ] **私密交接社团 Gmail 凭据：** 面对面或端到端私信转交 `umdancesportc@gmail.com` 的登录密码，并更新 2 步验证的安全手机号码及备用救援码。
- [ ] **为新执委创建管理员账号：** 在 **Admin Accounts › + NEW ADMIN**，为新任主席与技术部长创建具有 **Admin** 权限的网站账号。
- [ ] **转交 GitHub 仓库管理权：** 在 **GitHub › Repository Settings › Collaborators** 中将新任技术人员添加为管理员或协作者。
- [ ] **交接 Cloudflare 控制台访问权：** 确保新任技术人员可使用社团 Gmail 登入 dash.cloudflare.com。
- [ ] **系统设置巡视：** 带领新执委查看 **System Settings**，重点说明 **Admin Notification Emails** 与各舞种默认目录。
- [ ] **现场联合演练：** 共同完成一次模拟点名操作及回顾视频上传流程。

### 新任执委接管清单
- [ ] **修改社团 Gmail 密码：** 立即登录并更改 `umdancesportc@gmail.com` 密码，并绑定新执委的紧急恢复信箱与手机号。
- [ ] **更新管理员告警信箱：** 在 **System Settings › ADMIN NOTIFICATION EMAILS** 中输入新任执委的邮箱，以便在舞种报名满额时第一时间收到关停通知。
- [ ] **停用离任管理员账号：** 在 **Admin Accounts** 列表中对已毕业或离任的前任执委账号点击 **DEACTIVATE** 停用。
- [ ] **确认点名负责人绑定：** 检查各舞种是否有指定的 Class Rep，并确认其舞种权限绑定（`assignedStyleIds`）。
- [ ] **核验 Google Cloud 测试用户清单：** 登录 Google Cloud Console (`umdsc-class`) › Google Auth Platform › Audience，确认测试用户（Test users）列表与新任负责人 Gmail 一致。

---

## 3. 周期性运维节奏表

| 频率 | 运维任务 | 操作入口 | 关键要点 |
|---|---|---|---|
| **每月一次** | 新建当月活动 | Events › **+ NEW EVENT** | 填入 Google 表单编辑链接（用于满额关停）及响应表链接。 |
| **每月一次** | 归档往期结束的活动 | Events › **ARCHIVE** | 冻结旧活动，停止后台轮询以节约配额。 |
| **开课期间** | 监控舞种报名进度与名额 | Events / 像素吉祥物抽屉 | 满额自动关停表单；后台 1 分钟节流自动拉取报名更新。 |
| **每周一次** | 督导课后点名与视频上传 | Attendance / Media | 检查各舞种点名是否提交，并导出 Excel 备案。 |
| **每学期一次** | 课程负责人轮换或新增 | Roles & Admin Accounts | 使用内置 `Class Rep` 角色并限定舞种范围。 |
| **每年一次** | Google Drive 存储空间合规审计 | Google Drive | 确认未超额消耗免费 15 GB 存储空间。 |

---

## 4. 新增课程负责人（Class Rep）详细步骤

步骤 A–C 由管理员操作；步骤 D–F 由新任课程负责人完成。

### 步骤 A：确认 Class Rep 内置角色就绪
在 **Roles & Permissions** 中，系统已预设内置的 **Class Rep (`role_class_rep`)** 系统角色，具备 `attendance.view.all`、`attendance.edit` 与 `export.download` 权限。

### 步骤 B：创建负责人网站账号
1. 打开 **Admin Accounts › + NEW ADMIN**。
2. 填写**Username**（如 `locking.rep`）、**Display Name**（如 `Locking 负责人`）。
3. 角色选择 **Class Rep**。
4. **限定舞种范围 (`assignedStyleIds`)：** 在 Roles 页面的 Member Roles Panel 中，为其指定专属舞种（如仅勾选 *Locking*）。登录后系统将自动隐藏无关舞种及未授权的管理页面。
5. 将临时账号密码通过私信发送给负责人。

### 步骤 C：将负责人的 Gmail 添加至 Google Cloud 测试名单
由于 Google 登录目前处于项目测试模式：
1. 以 `umdancesportc@gmail.com` 登入 [https://console.cloud.google.com](https://console.cloud.google.com)。
2. 选中 **umdsc-class** 项目。
3. 导航至 **Google Auth Platform › Audience**。
4. 在 **Test users** 下点击 **+ Add users**，录入负责人的个人 Gmail，点击 **Save**。

### 步骤 D：负责人创建视频存放文件夹
1. 负责人在其个人的 Google Drive 中新建文件夹（例如 `Locking Recap Videos 2026`）。
2. 点击**共享**，以**编辑者 (Editor)** 权限添加 `umdancesportc@gmail.com`，常规访问权限保持“受限 (Restricted)”。
3. 复制文件夹链接发送给管理员。

### 步骤 E：管理员录入文件夹链接
在 **Media › CLASS LEAD VIDEO DRIVE FOLDERS › ▼ EXPAND** 中，找到对应舞种行，点击 **+ INSERT LINK**，粘贴链接并保存。

### 步骤 F：负责人在电脑端完成文件夹授权 💻
负责人在电脑浏览器登录系统：
1. 打开 **Media** 页面。
2. 点击 **SWITCH ACCOUNT** 切换至自己的个人 Gmail。
3. 在对应舞种行点击 **AUTHORIZE**，在弹出的 Google Picker 视窗中选中其文件夹并点击 **Select**。
4. 该行状态转为 **✓ AUTHORIZED**，并标记 **Uploads as** 其个人 Gmail。

---

## 5. 常见运维故障与排除方案

| 故障现象 | 根本原因 | 排除与解决方案 |
|---|---|---|
| **Google 表单显示“已不再接受表单回复”，但报名尚未截止** | 该舞种达到系统设置的名额上限，触发自动关停 | 在 **Events › 编辑活动** 中查看各舞种名额上限（`styleSlots`）。若活动场地允许扩招，提高名额上限后系统会自动将表单重新置为开放接收状态。 |
| **学员新填了表单，但在网站舞者名册中未出现** | 表格行残缺被安全过滤，或处于 60 秒轮询间隔 | 确认学员已填齐全姓名与学号。系统内建 3 层残破行过滤守卫，缺少关键字段的半行会被暂时忽略以防崩库。等待 1 分钟或在 Events 点击 **SYNC NOW**。 |
| **上传视频时弹出“Google 拒绝登录 / 访问受限”** | 负责人的 Gmail 未录入 OAuth 测试白名单 | 按照第 4 节 C 步，在 Google Cloud Console 的 `umdsc-class` 项目中将该 Gmail 添加至 Test users 清单。 |
| **提示“Uploads with X, but you are signed in as Y”** | 浏览器当前登录的 Google 账号与授权账号不符 | 点击页面顶部的 **SWITCH ACCOUNT** 切换回授权的 Google 账号 X。 |
| **Class Rep 看到无权访问的红字报错或看不到点名表** | 权限未刷新或舞种范围未分配 | 确认该账号已分配 **Class Rep** 角色并在 Member Roles Panel 中勾选了所属舞种。让其重新退出登入即可生效。 |
| **舞者反映在音乐库中看不到其他舞种的歌曲** | 误触了舞种筛选标签 | **共享音乐库 (`/library`)** 默认对所有舞者开放全库。请舞者将舞种过滤药丸标签选为“全部 (All)”。 |
| **视频上传至 99% 假死中断** | 手机屏幕锁屏导致后台网络被切断 | 提示负责人上传时保持屏幕常亮且不切换应用；150 MB 以上文件建议选用 **📦 SMALLER: COMPRESS FIRST**。 |
| **舞者修改资料提示“Matric already belongs to another dancer”** | 填写的学号已被其他舞者档案占用 | 系统强制学号唯一性防串号。核实舞者真实身份后，管理员可直接在 **Dancers › EDIT DANCER** 中协助更正。 |
