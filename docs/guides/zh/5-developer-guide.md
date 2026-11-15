# 开发者与源码维护指南 (Developer Guide)

**适用对象：**未来负责维护、迭代开发或代码审计的软件工程师与技术维护人员。  

| 资源配置项 | 配置地址 / 说明 |
|---|---|
| **源码仓库 (GitHub)** | [https://github.com/chandahui2004-hub/umdsc-dance-class](https://github.com/chandahui2004-hub/umdsc-dance-class) |
| **代码克隆指令** | `git clone https://github.com/chandahui2004-hub/umdsc-dance-class.git` |
| **线上生产网站** | [https://umdsc-dance-class.umdancesportc.workers.dev](https://umdsc-dance-class.umdancesportc.workers.dev) |
| **配置值与部署 ID** | [`docs/SETUP-VALUES.md`](../../SETUP-VALUES.md) |
| **主发布分支** | `main`（推送到 `main` 分支会自动触发 Cloudflare Workers 生产部署） |

> 🔒 **安全禁令：** 本代码库为完全开源公有仓库。**严禁提交任何敏感密钥：** 包括社团 Gmail 密码、`TOKEN_SECRET`、`SETUP_CODE`、`.admin-token`、`.clasprc.json` 或 Apps Script 脚本属性。`.gitignore` 已对这些文件进行排除。

---

## 1. 代码库 Monorepo 架构

项目采用 npm workspaces 进行多包组织与管理：

```
umdsc-dance-class/
├── api/          # 运行在 Google Apps Script 上的后端 API 服务
│   ├── src/      # TypeScript 源码（控制器、DB 抽象层、身份验证、预热、表单联动）
│   ├── test/     # Vitest 单元测试集（数据库事务、权限树、响应解析、脚本锁）
│   ├── build.mjs # esbuild 单文件打包脚本 -> api/dist/Code.js
│   └── package.json
├── web/          # 部署在 Cloudflare Workers 上的前端单页应用 (SPA)
│   ├── src/      # React 19, TypeScript, Tailwind CSS v4, 8-Bit 像素霓虹 UI
│   ├── e2e/      # Playwright 浏览器端到端测试（窄屏自适应布局、核心流转）
│   ├── vite.config.ts
│   └── package.json
├── shared/       # 前后端共享业务逻辑与类型定义 (@umdsc/shared)
│   ├── src/      # 共享数据契约、权限常量字典、时间解析库、校验器
│   └── package.json
├── scripts/      # 自动化辅助与可持续性验证脚本
│   ├── live-sandbox-verify.mjs  # 线上 GAS 沙箱自我清理与回归测试套件
│   ├── build-guide-docx.mjs     # 零依赖 OOXML Word 指南编译器
│   ├── call.mjs                 # 终端调用线上/本地 API 调试脚本
│   └── loadtest.mjs             # 并发压力测试工具
└── docs/         # 架构设计规约 (specs)、执行计划 (plans)、交接文档与中英指南
```

### 数据流与执行时序
```
舞者 / 管理员浏览器 (React 19 SPA 运行在 Cloudflare Workers)
         │
         │  HTTPS JSON API (POST /?action=...)
         ▼
Google Apps Script 线上服务端 (api/dist/Code.js)
         ├── 鉴权与 JWT 签名核验 (基于 TOKEN_SECRET 的 HMAC SHA-256)
         ├── 乐观并发控制与防重锁 (withScriptLock)
         ├── Google Sheets 关系型表格存储 (UMDSC_System 表格)
         └── Google Forms 满额自动关停与表单响应 60s 节流拉取
         ▲
断点续传直传链路 (前端直接调用 Google Drive API v3，采用 GIS OAuth 凭证)
```

---

## 2. 本地开发环境搭建

### 环境要求
- **Node.js:** v24.x 或更高版本
- **Git:** 任意标准 Git 客户端
- **Google Clasp:** 可通过 `npx @google/clasp` 免安装执行

### 初始化步骤
```bash
git clone https://github.com/chandahui2004-hub/umdsc-dance-class.git
cd "UMDSC Dance Class System"
npm install
npm run dev          # 启动本地 Vite 调试服务器，访问 http://localhost:5173
```

Windows 环境下亦可直接双击运行根目录的 **`START_UMDSC.bat`**。

> ⚠️ **线上环境联动提示：** 本地前端启动后默认直连线上 Google Apps Script 后端（即 `web/.env.production` 中配置的 `VITE_API_URL`）。在本地测试时切勿随意修改或删除生产真实数据。

---

## 3. 测试与验证流水线 (Verification Suite)

在推送任何代码前，请依次执行以下自动化检验指令：

```bash
# 1. 运行所有模块的单元测试 (shared + api + web)
npm test -ws --if-present

# 2. 全局静态检查与编译构建
npm run build

# 3. 手机端视口布局测试（确保 360px 与 390px 绝无横向溢出）
cd web ; npx playwright test e2e/phone-layout.spec.ts

# 4. 离线/沙箱端到端回归测试
cd web ; npx playwright test --grep-invert "@internet"

# 5. 线上 GAS 沙箱完整生命周期测试与自动清理
node scripts/live-sandbox-verify.mjs

# 6. Word 操作指南二进制生成与 OOXML XML 校验
node scripts/build-guide-docx.mjs
```

---

## 4. 前端发布部署 (Cloudflare Workers)

前端构建采用 Cloudflare CI 全自动化流程：

```bash
git checkout main
git merge <feature-branch>
git push origin main
```

Cloudflare Workers 检测到 `main` 分支更新后，会自动执行 `npm run build -w web`，并依据根目录 `wrangler.jsonc` 规范发布 `web/dist` 中的静态资产。整个过程通常在 60–90 秒内完成。

### 环境变量与公共配置 (`web/.env.production`)
- `VITE_API_URL`: 生产后端 Google Apps Script 执行入口。
- `VITE_GOOGLE_CLIENT_ID`: Google 云端硬盘授权的 Web 客户端 ID。
- `VITE_GOOGLE_API_KEY`: 绑定了特定域名白名单与 Drive API v3 的 Google API 密钥。
- `VITE_GOOGLE_APP_ID`: Google Cloud 项目数字编号（Google Picker 所需）。

---

## 5. 后端 API 部署 (Google Apps Script)

当修改了 `api/` 或 `shared/` 目录中的代码时，需执行后端部署：

```bash
# 在 api/ 目录或通过工作区命令执行：
npm run push -w api
```

`npm run push -w api` 指令会自动串联：
1. 调用 `esbuild` 将 TypeScript 打包为单文件 `api/dist/Code.js`。
2. 调用 `clasp push -f` 覆盖 Apps Script 线上代码。
3. 调用 `clasp deploy` 更新固定部署 ID：  
   `AKfycbz3zfWHdcl_3GuDsCf_ysLpH4XDNyklC87L9HuKpUVvhKrF-BU1M-QCf0PjPePAwwxIHA`。

> 💡 **固定部署入口保障：** 由于部署 ID 固定不变，前端配置的后端 URL 永远无需修改，彻底避免配置漂移。

### 后台定时巡检与预热任务
- **`warmDancerCaches` 定时触发器：** 在 Apps Script 控制台中运行一次 `installWarmTrigger`，将自动建立每 1–5 分钟执行的守护定时器：
  - 自动预热活跃活动的舞者数据缓存。
  - 遵循 `AUTO_SYNC_SECONDS = 60` 节流拉取 Google 表单的新增报名。
  - 严格执行 **3 层残缺数据守卫**，过滤掉学员正在提交中的不完整行。
  - 运行 `syncFormStatusIfDue`，每 10 分钟双向巡检一次表单状态，满额时自动关闭表单并推送告警邮件。
  - 数据发生实质变更时自动递增 Script Properties 中的 `DATA_VERSION`，触发前端 React Query 缓存刷新。

---

## 6. UI 设计与可持续开发规范

代码库严格遵循以下前端技术与无障碍规范：

1. **8-Bit 像素霓虹美学：**
   - 采用自定义像素图标库 (`web/src/components/ui/pixelIcons.tsx`)、荧光色边框 (`--neon-cyan`, `--neon-pink`, `--neon-gold`, `--neon-orange`) 与暗夜底色 (`--night-1`, `--violet-1`)。
   - **禁止**应用通用极简或现代 SaaS 风格插件（如 `taste-skill`、`minimalist-skill`、`brutalist-skill`），必须保持纯正的 8 位复古电玩风格。
2. **文字可读性底线：**
   - **全站严禁低于 10px 的微小字体：** `web/src/` 中所有文本元素字号必须 `>= 10px`（`text-[10px]` 或更大），确保在手机视网膜屏幕上轻松辨识。
3. **触控热区规范：**
   - 所有的按钮、表单输入框与可交互控件，最小触控高度不得低于 `44px` (`min-h-[44px]`)。
4. **零横向滚动保证：**
   - 界面在 `360px` 与 `390px` 窄屏手机宽度下必须完全自适应，严禁产生横向滚动条或布局错位。
5. **数据缓存与状态收敛：**
   - React Query 缓存键统一收敛在 `web/src/lib/queryClient.ts` 中管理。
   - 数据格式处理优先复用 `@umdsc/shared`，杜绝重复实现解析逻辑。
