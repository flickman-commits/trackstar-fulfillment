/**
 * The Sales tools Trackstar exposes over MCP.
 *
 * These exist so the overnight CRM upkeep, a Claude session on Matt's plan,
 * can leave tomorrow's emails ready. Attio is read and written through the
 * session's own Attio connector; the app is only asked for what Attio does
 * not know: which touch comes next for each deal, the template and rules for
 * it, and a place to hold the draft until a person sends it. The app does no
 * thinking in that loop; it holds the drafts and enforces the rules.
 *
 * Gated behind MCP_WRITE_TOKEN, the same tier as the repair tools.
 */
import { salesQueue, salesRules, saveDraft, finishRun } from '../domain/sales/nightly.js'

const text = value => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

export const SALES_TOOLS = [
  {
    name: 'sales_rules',
    description:
      'The house style, the charity-specific rules, both cadences, the sender identity, the ' +
      'daily cap, and what the server will reject on save. Live settings, not constants: read ' +
      'this once at the start of every run.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sales_queue',
    description:
      'Tomorrow\'s outreach, per Attio owner, read live from Attio. For each owner: `followUps` ' +
      '(deals at Reached Out whose next touch is due) and `newOutreach` (deals at Not Contacted ' +
      'with a person to write to, up to the daily cap, in priority order). Each item carries the ' +
      'deal id, the person (name, email, title, Attio\'s description), the company\'s Attio ' +
      'enrichment, the deal notes, the next cadence step and its purpose, the last email sent ' +
      'from the tool, and a template draft as the baseline to beat. Items with hasPrep=true ' +
      'are already written tonight; skip them. `needsContact` lists deals with nobody to email: ' +
      'find a named person and add them to the deal in Attio. `exhausted` lists sequences that ' +
      'have run out and need a human decision; report them, never draft.',
    inputSchema: {
      type: 'object',
      properties: {
        motion: { type: 'string', enum: ['Race', 'Charity', 'Corporate'], description: 'Optional: one motion only.' },
      },
    },
  },
  {
    name: 'sales_save_draft',
    description:
      'Hold a draft for the morning, under its Attio deal. The server checks it against the ' +
      'rules and refuses it with the reasons if it fails; fix and try again. One to three ' +
      'variants is plenty. The touch number must match the deal\'s next step (see sales_queue).',
    inputSchema: {
      type: 'object',
      properties: {
        dealId: { type: 'string', description: 'The Attio deal record id from sales_queue.' },
        personId: { type: 'string', description: 'The Attio person record id it is addressed to. Defaults to the first person with an email.' },
        touchNumber: { type: 'number' },
        variants: {
          type: 'array',
          items: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'body'] },
          minItems: 1, maxItems: 5,
        },
      },
      required: ['dealId', 'variants'],
    },
  },
  {
    name: 'sales_finish',
    description:
      'Call this last, always, even after a failure. Records what the night produced so the ' +
      'Sales page can show it. A run that never calls this reads as a run that did not finish.',
    inputSchema: {
      type: 'object',
      properties: {
        prepared: { type: 'number', description: 'Drafts saved, total.' },
        followUps: { type: 'number', description: 'Of those, follow-ups to people already contacted.' },
        fresh: { type: 'number', description: 'Of those, first touches.' },
        skipped: { type: 'array', items: { type: 'string' }, description: 'Deals you could not draft and why, one line each.' },
        notes: { type: 'string', description: 'Anything the reps should know this morning, in two or three sentences.' },
      },
    },
  },
]

export const SALES_HANDLERS = {
  sales_rules: async () => text(await salesRules()),
  sales_queue: async (args) => text(await salesQueue({ motion: args?.motion })),
  sales_save_draft: async (args) => text(await saveDraft({
    dealId: String(args.dealId),
    personId: args.personId ? String(args.personId) : undefined,
    touchNumber: args.touchNumber ? Number(args.touchNumber) : undefined,
    variants: args.variants,
    source: 'routine',
  })),
  sales_finish: async (args) => text(await finishRun(args || {})),
}

export const SALES_TOOL_NAMES = new Set(SALES_TOOLS.map(t => t.name))
