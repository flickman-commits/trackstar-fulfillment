/**
 * Notion service — fetches the Ad Ops Playbook page so the cron passes the
 * living decision rules to Claude on every run.
 *
 * Auth: NOTION_API_KEY (Internal Integration Secret). The integration MUST
 * be connected to the playbook page (Page menu → Connections → Add) or
 * Notion returns 404 even though the page exists.
 *
 * Returns the page's content as plain markdown-ish text. The Claude prompt
 * doesn't need perfect formatting — it just needs the thresholds, the
 * decision framework table, and the angle categories to be readable.
 */
import { Client } from '@notionhq/client'
import prisma from '../../api/_lib/prisma.js'

const PLAYBOOK_PAGE_ID = '322977ac2a3e8158b3ecc1bc02c3f023'

// SystemConfig key for the cached playbook. Bumping the version invalidates
// all existing cache entries — useful if the rendering logic changes.
const CACHE_KEY = 'notion_playbook_cache_v1'

// 24h TTL. The playbook changes infrequently — when Matt updates it manually,
// the cron uses the previous-day version for at most one run, then refreshes.
// Acceptable tradeoff for staying under the 60s function timeout.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

let cachedClient = null
function getClient() {
  if (cachedClient) return cachedClient
  const token = process.env.NOTION_API_KEY
  if (!token) throw new Error('NOTION_API_KEY not set')
  cachedClient = new Client({ auth: token })
  return cachedClient
}

/**
 * Convert a Notion block to a plain-text line. Recursively handles children.
 * We're going for "good enough for Claude to read" — not pixel-perfect
 * rendering. Tables, code, dividers, headings, bullets, callouts all map
 * to predictable markdown.
 */
function renderBlock(block, indent = 0) {
  const pad = '  '.repeat(indent)
  const rich = (arr) => (arr || []).map(t => t.plain_text || '').join('')
  const t = block.type
  const data = block[t]
  if (!data) return ''

  switch (t) {
    case 'paragraph':
      return pad + rich(data.rich_text)
    case 'heading_1':
      return `\n${pad}# ${rich(data.rich_text)}`
    case 'heading_2':
      return `\n${pad}## ${rich(data.rich_text)}`
    case 'heading_3':
      return `\n${pad}### ${rich(data.rich_text)}`
    case 'bulleted_list_item':
      return `${pad}- ${rich(data.rich_text)}`
    case 'numbered_list_item':
      return `${pad}1. ${rich(data.rich_text)}`
    case 'to_do':
      return `${pad}- [${data.checked ? 'x' : ' '}] ${rich(data.rich_text)}`
    case 'quote':
      return `${pad}> ${rich(data.rich_text)}`
    case 'callout':
      return `${pad}> ${data.icon?.emoji || '💡'} ${rich(data.rich_text)}`
    case 'code':
      return `${pad}\`\`\`\n${pad}${rich(data.rich_text)}\n${pad}\`\`\``
    case 'divider':
      return `${pad}---`
    case 'table_row': {
      const cells = (data.cells || []).map(c => rich(c).trim())
      return `${pad}| ${cells.join(' | ')} |`
    }
    case 'table':
      // Header is rendered by the first child row; just emit a placeholder
      return ''
    case 'toggle':
      return `${pad}▸ ${rich(data.rich_text)}`
    default:
      // Unknown block types — best effort: emit any rich_text we can find
      if (data.rich_text) return pad + rich(data.rich_text)
      return ''
  }
}

/**
 * Recursively fetch all blocks under a parent (page or block).
 * Notion pages can be deeply nested; we walk the tree depth-first to
 * preserve reading order.
 */
async function fetchBlocksRecursive(client, parentId, indent = 0) {
  const lines = []
  let cursor = undefined

  do {
    const res = await client.blocks.children.list({
      block_id: parentId,
      start_cursor: cursor,
      page_size: 100,
    })
    for (const block of res.results) {
      const line = renderBlock(block, indent)
      if (line) lines.push(line)
      if (block.has_children) {
        const child = await fetchBlocksRecursive(client, block.id, indent + 1)
        if (child) lines.push(child)
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)

  return lines.join('\n')
}

/**
 * Fetch the Ad Ops Playbook as a single markdown-ish string.
 *
 * Cached in Postgres (SystemConfig) with a 24h TTL — Notion's recursive
 * block-fetch API can take 5-15 seconds, which alone risks tipping the
 * weekly cron over the 60s function timeout. Caching means only the first
 * run of any 24h window pays that cost; subsequent runs (or any other
 * code that needs the playbook) get an instant DB read.
 *
 * @param {object} opts
 * @param {boolean} opts.forceFresh - skip the cache and re-fetch from Notion.
 *   Useful for testing or after a known playbook edit.
 */
export async function fetchPlaybookMarkdown({ forceFresh = false } = {}) {
  // Cache read (best-effort — if the DB is down, fall through to Notion)
  if (!forceFresh) {
    try {
      const row = await prisma.systemConfig.findUnique({ where: { key: CACHE_KEY } })
      if (row?.value) {
        const cached = JSON.parse(row.value)
        const age = Date.now() - (cached.cachedAt || 0)
        if (cached.text && age < CACHE_TTL_MS) {
          const ageMin = Math.round(age / 1000 / 60)
          console.log(`[notionPlaybook] Cache HIT (age ${ageMin}min, ${cached.text.length} chars)`)
          return cached.text
        }
      }
    } catch (e) {
      console.warn('[notionPlaybook] Cache read failed (will fetch fresh):', e.message)
    }
  }

  // Cache miss / forced refresh — hit Notion
  try {
    console.log('[notionPlaybook] Cache miss — fetching from Notion...')
    const client = getClient()
    const text = await fetchBlocksRecursive(client, PLAYBOOK_PAGE_ID)

    // Write back to cache (best-effort — if this fails the function still
    // succeeds, we just won't have a cached copy for next time)
    try {
      const value = JSON.stringify({ text, cachedAt: Date.now() })
      await prisma.systemConfig.upsert({
        where: { key: CACHE_KEY },
        create: { key: CACHE_KEY, value },
        update: { value },
      })
      console.log(`[notionPlaybook] Cached ${text.length} chars`)
    } catch (e) {
      console.warn('[notionPlaybook] Cache write failed (non-fatal):', e.message)
    }

    return text
  } catch (e) {
    console.error('[notionPlaybook] Failed to fetch:', e.message)
    return null
  }
}
