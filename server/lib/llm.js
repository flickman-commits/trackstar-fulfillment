/**
 * One door to whatever model is behind it.
 *
 * Every feature that needs a completion calls `complete()` here and nothing
 * else in the app imports a model SDK. That is the whole design: the app is
 * meant to run on Claude today and on a local model on Matt's own GPUs later,
 * and the only file that should change when that happens is this one plus an
 * env var.
 *
 * Two backends:
 *
 *   anthropic  The official SDK. Default model claude-opus-5. Thinking is on
 *              by default on that model, so the request does not set it; depth
 *              is controlled with output_config.effort, which callers pick per
 *              job (email drafting wants "low", a report wants "high").
 *
 *   openai     Any OpenAI-compatible chat endpoint: OpenAI itself, or Ollama,
 *              vLLM, LM Studio and llama.cpp on a local box. Plain fetch
 *              against LLM_BASE_URL, no SDK.
 *
 * Selection: LLM_PROVIDER wins; otherwise anthropic when ANTHROPIC_API_KEY or
 * ANTHROPIC_AUTH_TOKEN is set, otherwise openai when LLM_API_KEY / OPENAI_API_KEY is set.
 *
 * JSON: callers pass `json: true` and get back a parsed object. Both backends
 * are asked for JSON in the prompt and the reply is parsed leniently (code
 * fences and stray prose stripped), so the contract is the same whichever
 * model answered. That is deliberate: provider-specific structured-output
 * modes would tie prompts to one backend.
 *
 * Web search: pass `webSearch: true` and Anthropic runs its own search tool
 * server-side, so a question needing live facts needs no second vendor. An
 * OpenAI-compatible endpoint gets no search - a local model on a GPU cannot
 * browse - so callers must check `canSearch()` and have a plan when it is
 * false, rather than silently receiving a confidently wrong answer built from
 * training data.
 *
 * Every call logs provider, model, tokens, elapsed and a caller-supplied
 * `purpose` so cost can be attributed per feature. When a ModelRun table
 * exists this is the one place to persist it.
 */

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5'
const DEFAULT_OPENAI_MODEL = 'gpt-4o'

/** Anthropic's server-side search tool. Runs on their infrastructure, no beta header. */
const WEB_SEARCH_TOOL = 'web_search_20260209'
/**
 * A server-tool turn that hits the server's own loop limit comes back with
 * stop_reason "pause_turn" and has to be re-sent to continue. Bounded so a
 * pathological question cannot bill forever.
 */
const MAX_RESUMES = 3

function pickProvider() {
  const explicit = (process.env.LLM_PROVIDER || '').toLowerCase()
  if (explicit === 'anthropic' || explicit === 'openai') return explicit
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'anthropic'
  if (process.env.LLM_API_KEY || process.env.OPENAI_API_KEY) return 'openai'
  return null
}

/** True when some backend is configured. Lets UI say "no model configured" early. */
export function isLlmConfigured() {
  return pickProvider() !== null
}

/**
 * Can the configured backend look things up on the live web?
 *
 * Only Anthropic can, via its server-side search tool. This is deliberately a
 * separate question from "is a model configured": moving to a local model
 * keeps drafting working and takes search away, and the caller should know
 * that rather than find out from a hallucinated biography.
 */
export function canSearch() {
  return pickProvider() === 'anthropic'
}

/** What is currently answering, for status panels. Never includes a key. */
export function llmInfo() {
  const provider = pickProvider()
  if (!provider) return { configured: false }
  const model = process.env.LLM_MODEL
    || (provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL)
  const baseUrl = provider === 'openai'
    ? (process.env.LLM_BASE_URL || 'https://api.openai.com/v1')
    : undefined
  return { configured: true, provider, model, baseUrl, canSearch: provider === 'anthropic' }
}

/**
 * Pull a JSON object or array out of model text. Models asked for "JSON only"
 * still sometimes wrap it in ```json fences or a sentence; this finds the
 * outermost {...} or [...] and parses that.
 */
export function extractJson(text) {
  if (!text) throw new Error('Model returned an empty response')
  let s = String(text).trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(s) } catch { /* fall through */ }
  const start = Math.min(...['{', '['].map(c => { const i = s.indexOf(c); return i < 0 ? Infinity : i }))
  if (!Number.isFinite(start)) throw new Error('Model response contained no JSON')
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  const end = s.lastIndexOf(close)
  if (end <= start) throw new Error('Model response contained unterminated JSON')
  return JSON.parse(s.slice(start, end + 1))
}

/**
 * @param {object} opts
 * @param {string} opts.system        System prompt.
 * @param {string} opts.prompt        User message.
 * @param {boolean} [opts.json]       Parse the reply as JSON and return it as `json`.
 * @param {number}  [opts.maxTokens]  Output cap. Default 4000.
 * @param {'low'|'medium'|'high'|'xhigh'|'max'} [opts.effort]  Anthropic effort; default "medium".
 * @param {number}  [opts.temperature] OpenAI-compatible backends only (Anthropic 4.6+ rejects it).
 * @param {string}  [opts.model]      Override the configured model for this call.
 * @param {string}  [opts.purpose]    Short label for logs, e.g. "sales.draft".
 * @param {boolean} [opts.webSearch]   Let the model search the live web (Anthropic only).
 * @param {number}  [opts.maxSearches] Cap on searches per call. Default 5.
 * @returns {Promise<{ text: string, json?: any, provider: string, model: string,
 *   usage: { input: number, output: number, searches: number }, ms: number,
 *   sources: string[] }>}
 */
export async function complete({
  system,
  prompt,
  json = false,
  maxTokens = 4000,
  effort = 'medium',
  temperature = 0.7,
  model,
  purpose = 'llm',
  webSearch = false,
  maxSearches = 5,
}) {
  const provider = pickProvider()
  if (!provider) {
    throw new Error('No model configured. Set ANTHROPIC_API_KEY, or LLM_BASE_URL + LLM_API_KEY for an OpenAI-compatible endpoint.')
  }
  const startedAt = Date.now()
  const userMessage = json
    ? `${prompt}\n\nRespond with valid JSON only. No prose before or after it, no code fences.`
    : prompt

  let text = ''
  let usage = { input: 0, output: 0, searches: 0 }
  let usedModel = model
  const sources = []

  if (provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    // No explicit key: the SDK resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile.
    const client = new Anthropic()
    usedModel = model || process.env.LLM_MODEL || DEFAULT_ANTHROPIC_MODEL
    const tools = webSearch
      ? [{ type: WEB_SEARCH_TOOL, name: 'web_search', max_uses: maxSearches }]
      : undefined

    const messages = [{ role: 'user', content: userMessage }]
    let response
    for (let attempt = 0; ; attempt++) {
      response = await client.messages.create({
        model: usedModel,
        max_tokens: maxTokens,
        system,
        output_config: { effort },
        ...(tools ? { tools } : {}),
        messages,
      })
      usage.input += response.usage?.input_tokens || 0
      usage.output += response.usage?.output_tokens || 0
      usage.searches += response.usage?.server_tool_use?.web_search_requests || 0

      for (const block of response.content) {
        if (block.type === 'text') text += (text ? '\n' : '') + block.text
        // A search result's `content` is a list when the search worked and a
        // bare error object when it did not, so check before iterating.
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content) if (r?.url) sources.push(r.url)
        }
      }

      if (response.stop_reason === 'refusal') {
        const why = response.stop_details?.explanation || response.stop_details?.category || 'no reason given'
        throw new Error(`Model declined the request (${why})`)
      }
      // The server ran out of its own tool-loop budget mid-answer. Re-send with
      // the paused turn appended and it picks up where it stopped; adding a
      // "continue" message of our own would confuse it.
      if (response.stop_reason !== 'pause_turn' || attempt >= MAX_RESUMES) break
      messages.push({ role: 'assistant', content: response.content })
    }
  } else {
    if (webSearch) {
      throw new Error('This model cannot search the web. Web search needs the Anthropic backend; set ANTHROPIC_API_KEY or turn the feature off.')
    }
    const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || 'local'
    usedModel = model || process.env.LLM_MODEL || DEFAULT_OPENAI_MODEL
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: usedModel,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
        ],
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`LLM endpoint ${res.status}: ${body.slice(0, 300)}`)
    }
    const data = await res.json()
    text = data.choices?.[0]?.message?.content || ''
    usage = { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0, searches: 0 }
  }

  const ms = Date.now() - startedAt
  console.log(`[llm] ${purpose} provider=${provider} model=${usedModel} in=${usage.input} out=${usage.output} searches=${usage.searches} ${ms}ms`)

  const result = { text, provider, model: usedModel, usage, ms, sources: [...new Set(sources)] }
  if (json) result.json = extractJson(text)
  return result
}
