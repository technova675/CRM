---
name: ui-design-references
description: Curated GitHub repos and matching skills for anti-slop UI, design audits, design systems and polished pages. Use when building, redesigning or reviewing any UI, landing page or dashboard in this project, or when the user says the UI looks generic or AI-made.
---

# UI design references

Use this before shipping or reviewing UI. Pick the relevant repo or skill, read it, and apply its rules. Do not install anything without asking.

## Repos

| # | Repo | Use it for | Matching skill (if installed) |
|---|------|-----------|-------------------------------|
| 1 | https://github.com/Leonxlnx/taste-skill | Premium frontend code; redesign skill that audits and fixes existing projects | `design-taste-frontend` |
| 2 | https://github.com/LeoStehlik/no-slop-ui | Rules against glassmorphism, gradient abuse, generic UI | `no-slop-ui` |
| 3 | https://github.com/funboy322/avoid-ai-design | Audit and rewrite AI-generated frontend; scanner to run on every UI edit | `avoid-ai-design` (`scripts/detect.mjs`) |
| 4 | https://github.com/miqdadbadjuber/anti-slop | UI rules, plus cleaning AI-style code comments | `antislop`, `antislop-ui`, `antislop-code` |
| 5 | https://github.com/Netxeo/skill-file-design | 100+ anti-AI design laws and UI principles | `netxeo-design` |
| 6 | https://github.com/GrubbyLee/design-guide | Pick a direction, lock a contract, build the UI, verify | `design-guide` |
| 7 | https://github.com/lotfb86/web-design-skills | Frontend design, responsive layouts, DESIGN.md references | `frontend-design`, `responsive-design`, `design-system-generator` |
| 8 | https://github.com/alchaincyf/huashu-design | Prototypes, slides, motion, MP4 export | `huashu-design` |

## How to apply in this project

- This is a CRM / reports app (dashboards, tables, upload flows), so favor the app-screen rules over marketing-page rules: dense, legible, restrained, consistent.
- For any UI change: load `no-slop-ui` or `antislop-ui` first, then `avoid-ai-design` to audit the result.
- For a redesign: `design-taste-frontend` or `design-guide`.
- For a new page, check the existing components and styles before adding new patterns, so the app stays on one design system.
- Check `node_modules/next/dist/docs/` before writing Next.js code (see AGENTS.md).
