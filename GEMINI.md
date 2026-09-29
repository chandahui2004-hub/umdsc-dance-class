# UMDSC Dance Class System — Gemini & Antigravity Configuration

## Current work — START HERE

1. Read the spec: `docs/superpowers/specs/2026-09-28-umdsc-dance-class-system-design.md`
2. Run the plan with the `executing-plans` skill: `docs/superpowers/plans/2026-09-28-umdsc-dance-class-system.md`
3. Setup values (Google IDs, links): `docs/SETUP-VALUES.md`. DanceCue source: `reference/DanceCue/`.

Rules:
- Stop at every **🧑 OWNER ACTION** step and wait for the owner.
- Never ask for or store the club Gmail password.
- Do **not** use `taste-skill`, `soft-skill`, `minimalist-skill`, `brutalist-skill`, `gpt-tasteskill`, `stitch-skill` or `redesign-skill`: the UI is 8-bit retro per spec §13.1.

## Web Development Agent Skills

This project is enabled with the full Agent Skills web development suite:
- **UI/UX**: `ui-ux-pro-max`, `impeccable`, `taste-skill`, `ui-styling`, `design-system`
- **Testing & Quality**: `webapp-testing`, `code-simplifier`, `code-review`
- **Engineering Workflows**: `test-driven-development`, `systematic-debugging`, `executing-plans`, `writing-plans`, `subagent-driven-development`, `verification-before-completion`

All skills are registered via [`.agents/skills.json`](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/.agents/skills.json) and located in [`.agents/skills/`](file:///c:/Users/user/Downloads/UMDSC%20Design/UMDSC%20Dance%20Class%20System/.agents/skills).
