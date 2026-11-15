# UMDSC Dance Class System — Gemini & Antigravity Configuration

## Current Architecture & Production Status

1. **System Design & Specs:**
   - Architecture & Sustainability: [`docs/superpowers/specs/2026-11-14-sustainability-audit-dedup-and-handover-design.md`](docs/superpowers/specs/2026-11-14-sustainability-audit-dedup-and-handover-design.md)
   - Handover & Audit Plan: [`docs/superpowers/plans/2026-11-14-sustainability-audit-dedup-and-handover.md`](docs/superpowers/plans/2026-11-14-sustainability-audit-dedup-and-handover.md)
   - Initial Design Spec: [`docs/superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md`](docs/superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md)
2. **Operations & Handover Documentation:**
   - Operational Manual: [`docs/HANDOVER.md`](docs/HANDOVER.md)
   - User & Admin Guides (EN & 中文, with Word .docx downloads): [`docs/guides/README.md`](docs/guides/README.md)
   - Non-Secret Public Configuration Values: [`docs/SETUP-VALUES.md`](docs/SETUP-VALUES.md)
3. **Core Verification & Deployment Commands:**
   - Deploy Backend API: `npm run push -w api` (builds + clasp push + clasp deploy)
   - Live Sandbox Verification: `node scripts/live-sandbox-verify.mjs`
   - Recompile All 10 Word Guides: `node scripts/build-guide-docx.mjs`
   - Test Mobile Zero-Overflow: `cd web ; npx playwright test e2e/phone-layout.spec.ts`

---

## Invariant Rules for All Agents

- **Stop at every 🧑 OWNER ACTION step and wait for the owner.**
- **Never ask for, store, log, or commit the club Gmail password, `TOKEN_SECRET`, `SETUP_CODE`, `.admin-token`, or `.clasprc.json`.**
- **Do NOT use `taste-skill`, `soft-skill`, `minimalist-skill`, `brutalist-skill`, `gpt-tasteskill`, `stitch-skill`, or `redesign-skill`: the UI is strictly 8-bit retro per spec §13.1.**
- **Enforce font size `>= 10px` across `web/src/` and tap targets `>= 44px`.**

---

## Web Development Agent Skills

This project is enabled with the full Agent Skills web development suite:
- **UI/UX**: `ui-ux-pro-max`, `impeccable`, `ui-styling`, `design-system`
- **Testing & Quality**: `webapp-testing`, `code-simplifier`, `code-review`
- **Engineering Workflows**: `test-driven-development`, `systematic-debugging`, `executing-plans`, `writing-plans`, `subagent-driven-development`, `verification-before-completion`

All skills are registered via [`.agents/skills.json`](.agents/skills.json) and located in [`.agents/skills/`](.agents/skills).
