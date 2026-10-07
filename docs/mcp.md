# Trackstar MCP

The fulfillment tool as an MCP server, so Claude (on a phone, on the web, in a
scheduled routine) and other tools can ask it questions and do a few things.

- **Endpoint:** `https://fast.trackstar.art/api/mcp` (Streamable HTTP, JSON responses, stateless)
- **Auth:** an API key in `Authorization: Bearer <key>`
- **Keys:** Settings → Admin → API Keys. Shown once. Each acts as a person and
  is limited to that person's role, then to the scopes ticked. Revoke any time.

## Connecting Claude

Settings → Connectors → Add custom connector:

- URL: `https://fast.trackstar.art/api/mcp`
- Authentication: None
- Advanced → additional headers: `Authorization: Bearer <key>`

The same connector is then available in the Claude apps on your phone.

## Scopes

| Scope | What it allows | Who can hold it |
|---|---|---|
| read | orders, statuses, approval links, bulk runs, team, reports | anyone, service keys too |
| write | assign, comment, set a design status, run an import | a person |
| admin | help shifts and spreading the order list | an admin |
| repair | the nightly routine's scraper tools | an admin, or a service key |

A **service key** has no person behind it and can only read or repair: anything
that changes an order is done as someone, and shows in the Activity Log as them.

## Tools

Read: `connection_check`, `orders_overview`, `list_orders`, `get_order`,
`search_orders`, `custom_orders_status`, `partner_orders_status`,
`approval_link`, `bulk_orders_status`, `current_team`, `nightly_report`,
`scraper_coverage`, `race_dates`.

Write: `assign_order`, `add_comment`, `set_design_status`, `run_import`.

Admin: `add_help_shift`, `end_help_shift`, `spread_order_list`.

Repair: `run_sweep`, `finish_sweep`, `probe_scrapers`, `capture_fixture`,
`discover_event_ids`, `trace_scraper`, `fetch_timing_page`, `save_event_id`,
`probe_preview`, `wait_for_deploy`, `sync_catalog`.

## Safety

- Keys are stored as a hash; a wrong key is a 401 and counts toward a
  per-address limit (20 in 10 minutes). Each key may make 240 calls in 10 minutes.
- Without a key, the server lists the read tools (names only) and every call
  says a key is needed. Nothing about the server's configuration is disclosed.
- Input is validated with zod before a handler runs. Results are small,
  explicit shapes; no raw Shopify, Etsy or Artelo payloads leave the server.
- A failing tool returns a short message and a reference id, never the error.
- Every call is logged with the key's name; every write is in the Activity Log.

## Adding a tool

Add it to the right file in `server/services/mcp/tools/` with `name`, `title`,
`description`, `scope`, `readOnly`, a zod `input` shape and a `handler` that
calls domain code and returns a plain object (with a `summary` for writes).
Throw `ToolError` for anything the caller should read as written.
