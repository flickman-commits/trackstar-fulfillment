/**
 * The Sales tools Trackstar exposes over MCP.
 *
 * These exist so the overnight routine - a Claude session on Matt's plan, not
 * a metered API call - can do the outreach work. The session does the
 * thinking: it reads the queue, researches each person with its own web
 * search, writes the email, and hands the result back here. The app does no
 * thinking at all in that loop; it holds the data and enforces the rules.
 *
 * Gated behind MCP_WRITE_TOKEN, the same tier as the repair tools: saving
 * drafts and adding leads changes production data, and a connector is
 * reachable from every session that enables it.
 */
import { salesQueue, salesRules, saveResearch, saveDraft, addLead } from '../domain/sales/nightly.js'

const text = value => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

export const SALES_TOOLS = [
  {
    name: 'sales_rules',
    description:
      'The house style, the charity-specific rules, both cadences, and what the server will ' +
      'reject on save. Read this once at the start of a run before writing any email.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sales_queue',
    description:
      'Tomorrow\'s outreach, in the order it should be worked: `due` follow-ups whose clock has ' +
      'run out, then `new` orgs nobody has written to that have a contact with an email. Each ' +
      'item carries the contact, any stored research, the next cadence step and its purpose, ' +
      'previous emails in the thread, and a template draft as the baseline to beat. ' +
      '`needsContact` lists orgs we want to reach that have no email yet; find a named person ' +
      'on their site before sourcing brand-new orgs. Items with hasProposedDraft=true are ' +
      'already written; skip them.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many to return in total. Defaults to the daily cap.' },
        pipeline: { type: 'string', enum: ['RACE', 'CHARITY'], description: 'Optional: one pipeline only.' },
      },
    },
  },
  {
    name: 'sales_save_research',
    description:
      'Store what you found about a contact so it is never looked up twice. Facts must be ' +
      'specific and true; leave arrays empty rather than invent. The LinkedIn URL must be the ' +
      'exact profile of this person at this org, or omit it.',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        research: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            linkedinUrl: { type: 'string' },
            personInfo: { type: 'array', items: { type: 'string' } },
            companyInfo: { type: 'array', items: { type: 'string' } },
            sources: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['contactId', 'research'],
    },
  },
  {
    name: 'sales_save_draft',
    description:
      'Hold a draft for the morning. The server checks it against the rules and refuses it ' +
      'with the reasons if it fails; fix and try again. One to three variants is plenty. ' +
      'The touch number must match the org\'s next cadence step (see sales_queue).',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string' },
        contactId: { type: 'string', description: 'Who it is addressed to. Defaults to the primary contact with an email.' },
        touchNumber: { type: 'number' },
        variants: {
          type: 'array',
          items: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'body'] },
          minItems: 1, maxItems: 5,
        },
      },
      required: ['companyId', 'variants'],
    },
  },
  {
    name: 'sales_add_lead',
    description:
      'Add an org and a named person you sourced. Deduped against what exists by name and ' +
      'domain, and existing values are never overwritten. Generic inboxes (info@, events@) are ' +
      'refused. Say where the email came from: "website" (found on their own site), "apollo", ' +
      'or "guessed" (a pattern you inferred; stored but never sent to).',
    inputSchema: {
      type: 'object',
      properties: {
        pipeline: { type: 'string', enum: ['RACE', 'CHARITY'] },
        company: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'For a charity, the team brand if it has one, e.g. "Team In Training".' },
            website: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            tier: { type: 'string', description: 'Charity: "A - National", "B - Multi-race" or "C - Single race".' },
            runnerCount: { type: 'number' },
            raceDate: { type: 'string', description: 'ISO date, races only.' },
            identityTags: { type: 'array', items: { type: 'string' } },
            courseLandmark: { type: 'string' },
            notes: { type: 'string', description: 'Races the team runs, why they are a fit, anything the email writer should know.' },
          },
          required: ['name'],
        },
        contact: {
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string' },
            title: { type: 'string' },
            linkedinUrl: { type: 'string' },
          },
        },
        emailSource: { type: 'string', enum: ['website', 'apollo', 'guessed'] },
      },
      required: ['pipeline', 'company'],
    },
  },
]

export const SALES_HANDLERS = {
  sales_rules: async () => text(salesRules()),
  sales_queue: async (args) => text(await salesQueue({ limit: args.limit, pipeline: args.pipeline })),
  sales_save_research: async (args) => text(await saveResearch({ contactId: String(args.contactId), research: args.research })),
  sales_save_draft: async (args) => text(await saveDraft({
    companyId: String(args.companyId),
    contactId: args.contactId ? String(args.contactId) : undefined,
    touchNumber: args.touchNumber ? Number(args.touchNumber) : undefined,
    variants: args.variants,
    source: 'routine',
    preparedBy: 'nightly-sales',
  })),
  sales_add_lead: async (args) => text(await addLead({
    pipeline: args.pipeline,
    company: args.company,
    contact: args.contact,
    emailSource: args.emailSource || 'website',
  })),
}

export const SALES_TOOL_NAMES = new Set(SALES_TOOLS.map(t => t.name))
