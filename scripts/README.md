# Scripts

Utilities that run against the database from a terminal. All of them read
`.env.local`, which points at production, so a write here is live. Scripts
that change data are dry-run by default and take `--apply`.

| Script | What it does |
|---|---|
| `lint-scrapers.js` | Static checks on every race scraper config. Part of `npm run build`. |
| `verify-scraper-chip-times.js` | Runs every scraper against a known finisher and checks chip time, not gun time. `npm run test:scrapers`. |
| `verify-config.mjs` | Prints the active race configs and their event ids. |
| `verify-race-dates.mjs` | Lists race years whose date is computed or unsourced. |
| `apply-customer-results.mjs` | Records Instant Lookup results as research records for orders that have none. The import does this on its own; this is the by-hand run. |
| `import-races-from-csv.mjs` | Loads race rows from a CSV. |
| `explore-scraper.mjs` | Fetches a timing page the way a scraper would, for debugging. |
| `mark-order-rush.mjs` | Flags an order as rush. |
| `seed-fake-order.mjs` | Creates a fake order for local testing. |
| `setup-photo-bucket.mjs` | Creates the private Supabase bucket for customer photos. |
| `check-storage.mjs` | Reports what is in the storage buckets. |

One-off data fixes (the 2025 and 2026 Boston, Etsy and line-item repairs)
were removed in October 2026 once they had run; their commits are the record.
