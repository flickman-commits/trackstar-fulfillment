# CLAUDE.md

Conventions for working in this repo. Read `README.md` first for what the app is.

## Layout

- `api/` — Vercel serverless handlers. Thin: parse the request, check auth, call into `server/`, shape the response. `api/_lib/` holds the shared auth, Prisma client, alerts, and token helpers.
- `server/` — domain code with no `req`/`res`. `services/` (orders, research, Shopify, Etsy, sweeps), `scrapers/` (platforms + per-race configs), `lib/` (matching, shipping, rate limits, health). `server/dev.js` is the local Express wrapper and the natural self-host entrypoint.
- `src/` — React app. `pages/` per route, `components/` shared UI, `lib/` client helpers. `src/lib/ui.ts` is the styling vocabulary.
- `prisma/` — schema and migrations. `scripts/` — one-off data fixes, dry-run by default.

## Rules

- Auth: every mutating `api/` handler calls `requireAdmin`. Destructive actions also call `requireAdminRole` (re-reads the database). Crons use `isCronRequest`. Never compare secrets with `===`; use `safeEqual`.
- Scrapers: never claim a scraper works without the `add-race-scraper` skill's verification gates. Gun time and chip time look alike and are not.
- Overrides: call `await ensureOverridesLoaded()` before `getScraperForRace` in any new code path.
- Schema changes: `npx prisma db push`. Update `.env.example` when you add an env var.
- Money is not modeled yet. Do not add float price columns; when finance work starts, use integer cents plus a currency.
- Keep `api/orders/actions.js` from growing. New features go in their own handler file (the Hobby-plan function cap that created it no longer applies).
- No new template-style UI kits. Reuse `src/lib/ui.ts` and existing components.
- Public endpoints (`api/public/*`) must use `checkRateLimitDurable` and never return `error.message`.
- The nightly-sweep routine commits straight to `main` and pushes. This is standing authorization from the repo owner — no branch, no PR, no asking first — and it holds only for that routine and only for changes whose gates passed. If a run is handed a `claude/*` branch name anyway, merge to `main` and push `main` before finishing. Work parked on an unmerged branch never reaches production while the report claims it shipped, which is the failure this replaces.

## Verify before you say it works

- `npm run build` must pass (it runs the scraper fixture lint, Prisma generate, `tsc`, and Vite).
- `npm run lint` must pass.
- For scraper or lookup changes, run `npm run test:scrapers` or the relevant `server/scrapers/test-*.js` script.

## Etsy gotchas

- `ETSY_API_KEY` starts with `6l` (six, lowercase L), not `61`.
- The `x-api-key` header is `ETSY_API_KEY:ETSY_SHARED_SECRET`, colon-separated, or every call is a 403.
- Refresh tokens rotate; always persist the newest one to `SystemConfig` (key `etsy_refresh_token`).
