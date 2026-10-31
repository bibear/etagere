# Decisions

Short log of product and technical decisions. Newest last.

| # | Date | Decision | Why |
|---|---|---|---|
| D-01 | 2026-10-31 | AGPL-3.0 license | Self-hosted server: forks that host it for others must stay open. |
| D-02 | 2026-10-31 | One copy per ISBN, plus loans to people outside the household | Matches a household shelf; a loan locks the book like a reading does. |
| D-03 | 2026-10-31 | Home Wi-Fi only, no accounts; server refuses non-private IPs | Design principle "everything stays at home"; remote access would need auth and exposed HTTPS. |
| D-04 | 2026-10-31 | Everyone on the LAN can do everything | Household trust model, simplest onboarding. |
| D-05 | 2026-10-31 | App in French and English, repository in English | Reach open source contributors; household users get their language. |
| D-06 | 2026-10-31 | v1 adds to the design: manual entry, edit/delete book, profile management, dark mode, ideas to buy | Chosen by the maintainer. Not in v1: CSV import/export, multiple copies. |
| D-07 | 2026-10-31 | Recommendations: books on the shelf + ideas to buy from Open Library | Ideas to buy are the only other outbound call, cached 24 h. |
| D-08 | 2026-10-31 | Distribution: Docker image + `npx etagere-server`; Android APK on GitHub Releases; iOS via PWA; no store submission yet | No developer store accounts yet. Everything for later submission is prepared. |
| D-09 | 2026-10-31 | No hosted CI: `npm run check` + versioned pre-push hook | No GitHub Actions available. |
| D-10 | 2026-10-31 | Push straight to `main`, one commit per logical change, closing its issue | Personal project, fast feedback loop. |
| D-11 | 2026-10-31 | `node:sqlite` (built into Node 24) instead of a native SQLite module | No native compilation for `npx` and Docker. |
| D-12 | 2026-10-31 | Native apps talk plain HTTP to the LAN server: Android `usesCleartextTraffic`, iOS `NSAllowsLocalNetworking` + local network usage description | LAN-only server has no certificate. |
| D-13 | 2026-10-31 | PWA scanning: live camera only in a secure context (`localhost`); over plain-HTTP LAN the PWA falls back to "take a photo of the barcode" (`<input type=file capture>`) decoded with `@zxing/browser` | Browsers block `getUserMedia` on non-HTTPS origins. |
| D-14 | 2026-10-31 | Inputs validated by zod schemas in `@etagere/shared` (shared by server and app forms): unknown keys rejected, text trimmed, blank optional text stored as null, any `#RRGGBB` profile color accepted, ISBN normalised to ISBN-13 at the boundary | One source of truth for limits; strictness catches client bugs early. |
