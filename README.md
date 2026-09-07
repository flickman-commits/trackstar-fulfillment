# Trackstar Fulfillment

Internal operations app for [Trackstar](https://trackstar.art), personalized race-result prints. One place for order fulfillment and the tools around it, built to grow into the rest of the business over time.

## What it does today

- **Order fulfillment.** Imports orders from Artelo, enriches them from Shopify and Etsy, researches each runner's official chip time and pace across 19 timing platforms and 45 race configs, and tracks the order through proofing, approval, and shipping.
- **Proof approval.** Designers upload proofs; customers approve them on a token-gated public page; the tool records the outcome and emails the customer.
- **Instant Lookup.** A public results-lookup endpoint used by the storefront personalization widget, gated per race.
- **Creator program.** Invites, briefs, sample orders, and a creator portal.
- **Products and pricing.** Bulk Shopify product edits with undo, pricing calculators, Artelo cost sync.
- **Marathon Monopoly.** A partner-facing proposal page and an internal economics model.
- **Ops.** Nightly scraper health sweep, weekly ads debrief, Slack reports, an MCP server so Claude can read operational data.

## Stack

- Frontend: React 18, TypeScript, Vite, Tailwind. Entry in `src/main.tsx`; routes in `src/App.tsx`.
- API: Vercel serverless functions in `api/`. Shared domain code in `server/` (services, scrapers, libs).
- Database: PostgreSQL on Supabase via Prisma. Schema in `prisma/schema.prisma`.
- Storage: Supabase Storage for proofs and customer photos.
- Local dev: `server/dev.js` runs every `api/` handler under Express. Vite proxies `/api` to it.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # starts the API on :3001 and Vite on :5173
```

`.env.local` points at whatever database you put in `DATABASE_URL`. Be careful: if that is the production database, local writes are live.

## Useful commands

| Command | What it does |
|---|---|
| `npm run build` | Lints scraper fixtures, generates Prisma client, typechecks `src/`, builds the site |
| `npm run lint` | ESLint over `src/` |
| `npm run lint:scrapers` | Every scraper platform must ship a chip-time fixture |
| `npm run test:scrapers` | Verifies chip times against live results pages |
| `npx prisma db push` | Applies schema changes (interactive migrate does not work in this terminal) |

## Deploying

Push to `main`. Vercel builds and deploys. Cron schedules live in `vercel.json`.

## Where to look

- `docs/` has the Monopoly briefs and the brand guidelines.
- `.claude/skills/` has the operational runbooks: adding a race scraper, running the nightly sweep.
- `CLAUDE.md` has the conventions an AI assistant should follow in this repo.
