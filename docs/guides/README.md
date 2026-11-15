# UMDSC Dance Class System: Guides / 使用指南

**Website / 网站：** [https://umdsc-dance-class.umdancesportc.workers.dev](https://umdsc-dance-class.umdancesportc.workers.dev)  
**Admin login / 管理员登录：** [https://umdsc-dance-class.umdancesportc.workers.dev/admin/login](https://umdsc-dance-class.umdancesportc.workers.dev/admin/login)  
**Source code / 源代码：** [https://github.com/chandahui2004-hub/umdsc-dance-class](https://github.com/chandahui2004-hub/umdsc-dance-class)  

---

## Guide Index / 指南索引

| Guide / 指南 | For / 适用对象 | English | 中文 | Word (.docx) |
|---|---|---|---|---|
| **1. Class Lead Guide**<br>课程负责人指南 | Class leads & Class reps: attendance taking, Walk-in code, video and music upload<br>课程负责人与点名负责人：点名、Walk-in 临时通行码、上传视频与音乐 | [EN](en/1-class-lead-guide.md) | [中文](zh/1-class-lead-guide.md) | [EN](word/1-class-lead-guide-en.docx) · [ZH](word/1-class-lead-guide-zh.docx) |
| **2. Admin Guide**<br>管理员指南 | Club committee & admins: events, Google Form auto-gating, dance styles, instructors, accounts, system settings, shared music library<br>社团执委与系统管理员：活动、Google 表单自动满额关停、舞种、老师、账号、系统设置、共享音乐库 | [EN](en/2-admin-guide.md) | [中文](zh/2-admin-guide.md) | [EN](word/2-admin-guide-en.docx) · [ZH](word/2-admin-guide-zh.docx) |
| **3. Dancer Guide**<br>舞者指南 | Club dancers: login autocomplete, calendar, recap videos, shared music library, Music Studio, profile self-edit, mascot notifications<br>社团舞者：学号姓名联想登录、日历、课程回顾视频、跨舞种音乐库、练习室、修改个人资料、像素吉祥物通知 | [EN](en/3-dancer-guide.md) | [中文](zh/3-dancer-guide.md) | [EN](word/3-dancer-guide-en.docx) · [ZH](word/3-dancer-guide-zh.docx) |
| **4. Admin Handover Guide**<br>管理员交接指南 | Outgoing & incoming club committees: Google credentials handover, Class Rep onboarding, Google Form setup, troubleshooting<br>卸任与新任社团执委会：Google 账号交接、新增课程负责人、Google 表单规则、故障排除清单 | [EN](en/4-admin-handover-guide.md) | [中文](zh/4-admin-handover-guide.md) | [EN](word/4-admin-handover-guide-en.docx) · [ZH](word/4-admin-handover-guide-zh.docx) |
| **5. Developer Guide**<br>开发者与源码指南 | Developers & tech maintainers: monorepo architecture, Cloudflare Workers, Google Apps Script API deploy (`npm run push -w api`), tests, and sustainability rules<br>开发人员与技术维护者：代码仓库架构、Cloudflare Workers 前端、GAS 后端部署、测试指令与可持续开发规则 | [EN](en/5-developer-guide.md) | [中文](zh/5-developer-guide.md) | [EN](word/5-developer-guide-en.docx) · [ZH](word/5-developer-guide-zh.docx) |

---

## Role Summary / 权限角色概览

1. **Admin (`admin`)**: Complete system control — event creation, Google Form auto-gating, dance style & instructor master data, system settings, admin accounts, and full attendance/media management.
2. **Class Rep (`class_rep`)**: Built-in operational role for class PICs. Scoped by assigned dance styles (`assignedStyleIds`). Dynamic UI navigation automatically hides unauthorized administrative tabs, giving class reps focused access to attendance taking, Excel export, and class media.
3. **Dancer (`dancer`)**: Registered club members. Accesses class schedules, recap videos, the complete cross-style **Shared Music Library (`/library`)**, the interactive **Music Studio (`/studio`)**, and profile self-service (`/me`).

---

## Regenerating Word Documents / 重新生成 Word 文档

All 10 Word documents in `word/` are compiled directly from the markdown guides (`en/` and `zh/`) using a zero-dependency script that embeds all diagrams and screenshots:

```bash
node scripts/build-guide-docx.mjs
```

---

> 🔒 **Security Notice / 安全须知：** This folder is public on GitHub. Never commit passwords, Google account credentials, `TOKEN_SECRET`, `.admin-token`, or personal phone directories here. / 本文件夹在 GitHub 上完全公开，严禁提交任何密码、Google 账号凭据、密钥或个人隐私名单。
