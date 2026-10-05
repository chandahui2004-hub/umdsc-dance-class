# 开发者与源代码指南

**适用对象：**将来负责维护或修改程序的人。

| | |
|---|---|
| **源代码（GitHub）** | https://github.com/chandahui2004-hub/umdsc-dance-class |
| **下载源代码** | `git clone https://github.com/chandahui2004-hub/umdsc-dance-class.git` |
| **正式网站** | https://umdsc-dance-class.umdancesportc.workers.dev |
| **设置值**（各种 ID、部署 ID、网址） | [`docs/SETUP-VALUES.md`](../../SETUP-VALUES.md) |
| **正式上线的分支** | `main`。每次推送到 `main`，网站都会自动重新发布。 |

> 🔒 仓库是**公开的**。绝对不要提交密码、`.admin-token` 文件、`.clasprc.json` 或 Apps Script 属性的值。这些已经列在 `.gitignore` 里。

---

## 1. 系统架构

```
舞者 / 管理员的浏览器
   │  （网站：React 应用，托管在 Cloudflare Workers 静态资源）
   ▼
Google Apps Script 网页应用  ──►  Google Sheet 数据库（社团 Drive）
   （API：登录、资料）              Google Drive 文件夹（点名表）
   ▲
浏览器 → 直接上传视频到 Google Drive（Google 登录，drive.file 权限）
```

- **`web/`**：网站。React 19、TypeScript、Vite、Tailwind CSS v4。
- **`api/`**：服务器。TypeScript，用 esbuild 打包成 `api/dist/Code.js`，再用 **clasp** 部署到 Google Apps Script。
- **`shared/`**：网站和服务器共用的类型和工具。
- **`docs/`**：这些指南（`docs/guides/`）、设置值，以及设计历史（`docs/superpowers/specs` 和 `plans`：为什么这样设计）。
- **`scripts/`**：辅助脚本，例如 `call.mjs`，可以从终端调用 API。

---

## 2. 在自己的电脑上运行

需要 **Node.js 24** 和 **Git**。

```bash
git clone https://github.com/chandahui2004-hub/umdsc-dance-class.git
cd umdsc-dance-class
npm install
npm run dev          # 网站在 http://localhost:5173
```

Windows 上也可以双击 **`START_UMDSC.bat`**。

本地网站连接的是**正式**服务器（`web/.env.local` / `web/.env.production` 里的 `VITE_API_URL`），所以要小心：在本地做的修改会改到真实资料。

要在同一个 Wi-Fi 的手机上测试，运行 `npm run dev -w web -- --host`，再打开它显示的 “Network” 网址。

---

## 3. 测试：每次发布前都要运行

```bash
npm test                                         # 单元测试（shared + api + web）
npm run build                                    # 类型检查并构建全部
cd web && npx playwright test --grep-invert @internet   # 浏览器测试（手机 + 桌面）
```

`web/e2e/phone-layout.spec.ts` 检查手机宽度下没有内容被截断，请保持它通过。

---

## 4. 发布网站

```bash
git push origin main
```

Cloudflare（Workers & Pages › **umdsc-dance-class**）会用 `npm run build` 构建，并按仓库根目录的 **`wrangler.jsonc`** 部署 `web/dist`。大约 1–2 分钟后上线。如果没有更新，查看 Cloudflare 控制台的 **Deployments**。

网站设置在 **`web/.env.production`**：API 网址、Google OAuth client ID、API key 和 app ID。这些是浏览器用的公开密钥，本来就会公开；它们在 Google Cloud 里已限制只能从网站网址使用（API key › Website restrictions；OAuth client › Authorized JavaScript origins）。**如果网站网址改变，要在这两个地方都加上新网址。**

---

## 5. 部署服务器（Apps Script）

只有修改了 `api/` 或 `shared/` 才需要。

```bash
cd api
npx clasp login          # 只需一次，用 umdancesportc@gmail.com 登录
npm run push             # 构建并上传程序
npx clasp update-deployment <DEPLOYMENT_ID>   # 正式上线；ID 在 docs/SETUP-VALUES.md
```

`update-deployment` 会保持**同一个网址**，所以网站不用改。把新的版本号记录到 `docs/SETUP-VALUES.md`。打开 `<API 网址>?action=health` 检查，应该显示 `{"ok":true,...}`。

**Apps Script › Project Settings › Script properties**（值是机密，绝对不要复制到 GitHub）：

| 属性 | 意思 |
|---|---|
| `SYSTEM_SPREADSHEET_ID` | 数据库 Google Sheet |
| `TOKEN_SECRET` | 用来签署登录会话。更改后所有人都会被登出。 |
| `SETUP_CODE` | 首次设置用的一次性代码 |
| `CLUB_EMAIL` | 社团 Gmail |
| `DATA_VERSION`、`PERM_VERSION` | 系统自动管理 |

**加速触发器：**在 Apps Script 编辑器里运行一次 `installWarmTrigger`。它每 5 分钟预热一次缓存，让舞者第一次打开网站时更快。

---

## 6. 资料存放在哪里

- **数据库：**一个 Google Sheet。每个分页是一张表：Settings、Events、DanceStyles、Instructors、ClassSessions、MemberIndex、AttendanceSheets、Admins、Roles、RolePermissions、MemberRoles、Videos、Music、Sections、LinkHistory 和 AuditLog。文件夹在 System Settings › Database Folder。**除非你了解程序，否则不要手动修改这个表格**，栏位是按标题名称对应的。
- **报名资料：**每个活动的 Google 报名回复表格，系统只会读取。
- **点名：**每个活动在点名文件夹里建立的 Google Sheets。
- **视频：**各课程负责人的 Drive 文件夹 › 活动 › 课程。

---

## 7. 修改程序

1. 先阅读 `docs/superpowers/specs/` 里相关的设计文件。
2. 修改时一起写测试（`*.test.ts(x)` 放在程序旁边；浏览器测试在 `web/e2e/`）。
3. 运行第 3 节的命令。如果网站的新程序需要新的服务器功能，**先**部署服务器（第 5 节），再推送网站。
4. `git push origin main`（第 4 节）。

实用资料：
- 时间使用马来西亚时间（`Asia/Kuala_Lumpur`）。
- 权限代码列在 `shared/src/types.ts`（`PERMISSIONS`）。
- 视频上传和压缩：`web/src/features/media/UploadDialog.tsx` 和 `web/src/lib/media/videoCompressor.ts`。150 MB 以下的视频默认上传原片。
- 手机版面：`web/src/app/PhoneShell.tsx`。每个页面都必须在 360 px 宽度下能正常使用。
