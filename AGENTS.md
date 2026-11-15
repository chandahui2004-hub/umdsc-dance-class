# UMDSC Dance Class System — Agent Guidelines & Skills

This repository is configured with a comprehensive suite of **Web Development Agent Skills** for both **Antigravity** and **Claude Code**.

---

## System Overview & Production Architecture

The **UMDSC Dance Class System** is a production web application for the University of Malaya Dancesport Club:
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4 hosted on Cloudflare Workers static assets.
- **Backend API:** Google Apps Script Web App (`@umdsc/api`) connected to Google Sheets database (`UMDSC_System`).
- **Registration Engine:** Google Forms per-style slot auto-gating (`styleSlots`, `formUrl`), 60s throttled response auto-sync, and 3-layer Incomplete Sheet Row Guard.
- **Media & Music:** Hybrid video uploads (Google Drive client-side compressed/original + YouTube Unlisted) and universal **Shared Music Library (`/library` & `/admin/library`)**.
- **Access Control:** Built-in roles (`admin`, `class_rep`, `dancer`), style-scoped assignments (`assignedStyleIds`), and dynamic tab hiding.

### Key Developer Commands
```bash
npm test -ws --if-present                     # Unit tests (shared, api, web)
npm run build                                # Monorepo type-check & build
npm run push -w api                          # Build + clasp push + clasp deploy to immutable GAS deployment
node scripts/live-sandbox-verify.mjs         # Self-cleaning live GAS sandbox & sustainability suite
node scripts/build-guide-docx.mjs            # Zero-dependency docx compiler for all 10 Word guides
cd web ; npx playwright test e2e/phone-layout.spec.ts  # Mobile layout test (360px & 390px zero overflow)
```

### Essential References
- Handover Manual: [`docs/HANDOVER.md`](docs/HANDOVER.md)
- User & Administrator Guides: [`docs/guides/README.md`](docs/guides/README.md)
- Public Setup Values: [`docs/SETUP-VALUES.md`](docs/SETUP-VALUES.md)

---

## Invariant Rules for All Agents

1. **8-Bit Retro Neon Aesthetic (Spec §13.1):**
   - The UI is strictly 8-bit retro gaming with neon accents, custom pixel icons, and dark theme palette.
   - Do **NOT** use `taste-skill`, `soft-skill`, `minimalist-skill`, `brutalist-skill`, `gpt-tasteskill`, `stitch-skill`, or `redesign-skill`.
2. **Strict Font & Layout Bounds:**
   - **No sub-10px fonts:** Every font across `web/src/` must be `>= 10px`.
   - **Tap targets:** All interactive buttons and inputs must be `>= 44px`.
   - **Zero overflow:** Phone views must not overflow horizontally at 360px or 390px.
3. **Never Expose or Commit Secrets:**
   - Never ask for, store, log, or commit the club Gmail password, `TOKEN_SECRET`, `SETUP_CODE`, `.admin-token`, or `.clasprc.json`.
4. **Owner Action Gate:**
   - Stop at every **🧑 OWNER ACTION** step and wait for the owner.

---

## Active Skills & Workflows

### 🎨 UI/UX & Design Intelligence
- **`ui-ux-pro-max`**: Design intelligence for color schemes, typography, layout hierarchy, and responsive UI.
- **`impeccable`**: Polished visual review, micro-interactions, accessibility, animations, and typography pairing.
- **`ui-styling`**: Modern component styling with CSS tokens and Tailwind CSS.
- **`design-system`**: Design tokens, component specs, and UI consistency.

### 💻 Code Quality & Testing
- **`webapp-testing`**: Playwright browser automation, element validation, and end-to-end testing.
- **`code-simplifier`**: Refines code structure, avoids convoluted nesting, and ensures maintainable code.
- **`code-review`**: Multi-perspective code review for adherence to project standards and bug discovery.

### ⚡ Engineering Superpowers
- **`test-driven-development`**: TDD cycle for all major feature additions.
- **`systematic-debugging`**: Rigorous root cause analysis for any runtime or visual defects.
- **`writing-plans` & `executing-plans`**: Spec-driven phased implementation.
- **`verification-before-completion`**: Verifying all requirements and tests pass before completion.

---

## Skills Locations
- Antigravity Workspace: [`.agents/skills/`](.agents/skills)
- Claude Code Workspace: [`.claude/skills/`](.claude/skills)
- Global Antigravity: `~/.gemini/config/skills/`
- Global Claude Code: `~/.claude/skills/`
- Master Web Dev Skills Repository: [`agent-skills-for-develop-website`](../agent-skills-for-develop-website)
