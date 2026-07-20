# Theme files do NOT live here

The Shopify theme is version-controlled in its own repo:

    https://github.com/flickman-commits/trackstar-theme
    local: ~/Software/trackstar-art

`blocks/trackstar-instant-lookup.liquid` and `sections/trackstar-sticky-atc.liquid`
used to be kept here and pushed straight to the live theme. That is what caused the
2026-07-15 incident: the theme had no version control, the copies here drifted from
production, and a sync deleted the live block outright.

## Rules

- Never keep Shopify Liquid/JSON in this repo.
- Never run `shopify theme push` or `shopify theme dev` from this repo.
- Theme changes go: `trackstar-theme` repo -> `dev` branch -> PR -> merge to `main`.
  Shopify deploys `main` to the live theme automatically.

## What this repo owns

The lookup API that the theme block calls:

    /api/public/results-lookup   (gated by PUBLIC_LOOKUP_ENABLED + PUBLIC_LOOKUP_RACES)

The block's front-end code is theme code. It lives in the theme repo.
