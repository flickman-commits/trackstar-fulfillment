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
 * Every call logs provider, model, tokens, elapsed and a caller-supplied
 * `purpose` so cost can be attributed per feature. When a ModelRun table
 * exists this is the one place to persist it.
 */

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5'
const DEFAULT_OPENAI_MODEL = 'gpt-4o'

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

/** What is currently answering, for status panels. Never includes a key. */
export function llmInfo() {
  const provider = pickProvider()
  if (!provider) return { configured: false }
  const model = process.env.LLM_MODEL
    || (provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL)
  const baseUrl = provider === 'openai'
    ? (process.env.LLM_BASE_URL || 'https://api.openai.com/v1')
    : undefined
  return { configured: true, provider, model, baseUrl }
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
 * @returns {Promise<{ text: string, json?: any, provider: string, model: string,
 *   usage: { input: number, output: number }, ms: number }>}
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
  let usage = { input: 0, output: 0 }
  let usedModel = model

  if (provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    // No explicit key: the SDK resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile.
    const client = new Anthropic()
    usedModel = model || process.env.LLM_MODEL || DEFAULT_ANTHROPIC_MODEL
    const response = await client.messages.create({
      model: usedModel,
      max_tokens: maxTokens,
      system,
      output_config: { effort },
      messages: [{ role: 'user', content: userMessage }],
    })
    if (response.stop_reason === 'refusal') {
      const why = response.stop_details?.explanation || response.stop_details?.category || 'no reason given'
      throw new Error(`Model declined the request (${why})`)
    }
    text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
    usage = { input: response.usage?.input_tokens || 0, output: response.usage?.output_tokens || 0 }
  } else {
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
    usage = { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0 }
  }

  const ms = Date.now() - startedAt
  console.log(`[llm] ${purpose} provider=${provider} model=${usedModel} in=${usage.input} out=${usage.output} ${ms}ms`)

  const result = { text, provider, model: usedModel, usage, ms }
  if (json) result.json = extractJson(text)
  return result
}
