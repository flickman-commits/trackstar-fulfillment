# Nightly Sweep Network Blocker — Status

**Date:** 2026-08-30  
**Agent Run Status:** BLOCKED  
**Fallback Cron:** ACTIVE (09:00 UTC daily)

## Issue

The agent nightly sweep routine cannot execute its primary task because the remote execution environment's network policy blocks outbound access to `fast.trackstar.art:443`.

**Error:** Proxy gateway returns `403 Forbidden` to CONNECT requests  
**Root Cause:** Cloud sandbox egress proxy policy enforcement

## Current Workaround

Matt has restored a Vercel cron at 09:00 UTC (`/api/admin/nightly-sweep`) to produce a report on schedule. This ensures the morning email gets fresh fact data, even though fixes cannot be applied by the agent.

**Trade-off:** The cron produces no fixes, only facts. The agent (if it worked) would produce both.

## What's Being Sorted

The network allowlist for this execution environment needs to be configured to permit outbound connections to `fast.trackstar.art:443`. Once resolved:

- Agent runs at 05:00 UTC, files report with fixes
- Cron at 09:00 UTC can be removed (avoids the "hidden failure" problem Matt noted)
- Normal flow: agent fixes + reports first, cron refreshes facts only if agent fails

See: commit 2577fa0 for full context and reasoning.

## Next Steps

- Resolve network policy / allowlist for agent execution environment
- Remove Vercel cron once agent is fully operational
