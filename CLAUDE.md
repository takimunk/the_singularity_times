# CLAUDE.md

Read PLAN.md first: it holds the product's philosophy and aesthetic, and every change should fit it.

- Static Astro site, no backend. Do not add a server, database or auth before issue #4 (see PLAN.md).
- An issue is one Markdown file in `issues/`; the schema is `src/content.config.ts`.
- Brand values (fonts, colors) live only in `src/styles/brand.css`; components use the CSS variables, canvas code reads them via `palette()` in `src/lib/canvas.ts`. The branding thread owns that file.
- Page weight budget: 1.5 MB on first load. Video, WebGL and third-party embeds load lazily and have a static fallback.
- Every new third-party origin must be added to the CSP in `public/_headers`. No inline `<script>` that the CSP would block.
- Never re-upload other authors' work; embed it by URL with credit.
- UI text is English. Brand decisions come from the branding thread (shared folder `branding/HANDOFF.md`); do not invent new colors or fonts.
- Agents: code work is done by MAGI (Melchior, Balthasar, Casper); creative work by Evangelion characters. Name subagents that way.
- Run `npm run build` and `npm run check` before pushing. Node 24.
