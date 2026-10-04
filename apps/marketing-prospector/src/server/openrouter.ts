import type { DatabaseSync } from 'node:sqlite'
import { releaseUsageRequest, reserveUsageRequest, settleUsageRequest } from './usage.ts'

interface ModelPricing {
  prompt: number
  completion: number
  request: number
  expiresAt: number
}
interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface CompletionMetadata {
  finishReason: string | null
  requestId: string | null
  completionLimit: number
  reportedPromptTokens: number | null
  reportedCompletionTokens: number | null
}
export interface CompletionResult { content: string; promptTokens: number; completionTokens: number; metadata: CompletionMetadata }
export const citationFailureCategories = ['missing_citation','invalid_citation_shape','unknown_excerpt_id','cross_candidate_citation','unsupported_claim_scope'] as const
export type CitationFailureCategory = typeof citationFailureCategories[number]
export class CitationValidationError extends Error {
  readonly category: CitationFailureCategory
  constructor(category: CitationFailureCategory) {
    super({ missing_citation: 'Required citation missing', invalid_citation_shape: 'Invalid citation shape/cardinality', unknown_excerpt_id: 'unknown excerpt ID', cross_candidate_citation: 'Triage cited another candidate', unsupported_claim_scope: 'Unsupported citation claim scope' }[category])
    this.name = 'CitationValidationError'
    this.category = category
  }
}
type OutputErrorCode = 'truncated_output' | 'invalid_json' | 'invalid_citation' | 'invalid_output'
export class ModelOutputError extends Error {
  readonly code: OutputErrorCode
  readonly metadata: CompletionMetadata
  readonly citationCategory?: CitationFailureCategory
  constructor(code: OutputErrorCode, metadata: CompletionMetadata, citationCategory?: CitationFailureCategory) {
    const label = { truncated_output: 'Truncated model output (provider-reported output limit)', invalid_json: 'Invalid JSON model output', invalid_citation: 'Invalid evidence citation', invalid_output: 'Invalid structured model output' }[code]
    super(`${label}${citationCategory ? `; citation_category=${citationCategory}` : ''}; finish_reason=${metadata.finishReason ?? 'unknown'}; truncation=${code === 'truncated_output' ? 'reported' : metadata.finishReason === null ? 'unknown' : 'not reported'}; completion_limit=${metadata.completionLimit}; reported_prompt_tokens=${metadata.reportedPromptTokens ?? 'unknown'}; reported_completion_tokens=${metadata.reportedCompletionTokens ?? 'unknown'}; request_id=${metadata.requestId ?? 'unknown'}; usage reconciled; explicit retry only`)
    this.name = 'ModelOutputError'
    this.citationCategory = citationCategory
    this.code = code
    this.metadata = metadata
  }
}
// Never include JSON.parse messages (which can quote output) or arbitrary provider fields.
export function parseCompletion<T = unknown>(result: CompletionResult, validate?: (value: unknown) => T): T {
  let value: unknown
  try { value = JSON.parse(result.content) } catch { throw new ModelOutputError('invalid_json', result.metadata) }
  if (!validate) return value as T
  try { return validate(value) } catch (error) {
    if (error instanceof CitationValidationError) throw new ModelOutputError('invalid_citation', result.metadata, error.category)
    throw new ModelOutputError(/excerpt ID|citation|cited/i.test(error instanceof Error ? error.message : '') ? 'invalid_citation' : 'invalid_output', result.metadata)
  }
}
function reportedTokens(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null }
function safeRequestId(value: unknown): string | null { return typeof value === 'string' && /^(?:gen|req|chatcmpl)-[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null }
function safeFinishReason(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const reason = value.toLowerCase()
  return ['stop','length','max_tokens','max_output_tokens','content_filter','tool_calls','function_call','end_turn','eos'].includes(reason) ? reason : null
}

const pricingCache = new Map<string, ModelPricing>()
const PRICING_TTL_MS = 60_000
const RESERVATION_BUFFER = 1.25
const FIXED_BUFFER_MICROS = 1_000
const OPENROUTER_MODEL = 'google/gemma-4-31b-it'

export interface OpenRouterOptions {
  db: DatabaseSync
  runId: string
  messages: ChatMessage[]
  maxCompletionTokens: number
  responseFormat?: Record<string, unknown>
  fetcher?: typeof fetch
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim()
  if (!key) throw new Error('OpenRouter unavailable: set OPENROUTER_API_KEY on the server')
  return key
}

export function assertOpenRouterConfigured(): string {
  apiKey()
  return configuredOpenRouterModel()
}

export function configuredOpenRouterModel(): string {
  return OPENROUTER_MODEL
}

function priceValue(value: unknown, label: string): number {
  const price = Number(value)
  if (!Number.isFinite(price) || price < 0) throw new Error(`OpenRouter model catalog returned invalid ${label} pricing`)
  return price
}

async function getPricing(model: string, key: string, fetcher: typeof fetch): Promise<ModelPricing> {
  const cached = pricingCache.get(model)
  if (cached && cached.expiresAt > Date.now()) return cached
  const response = await fetcher('https://openrouter.ai/api/v1/models', {
    headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`OpenRouter model catalog returned HTTP ${response.status}`)
  const catalog = await response.json() as { data?: Array<{ id?: unknown; pricing?: Record<string, unknown> }> }
  const row = catalog.data?.find((entry) => entry.id === model)
  if (!row?.pricing) throw new Error(`OpenRouter model '${model}' is not listed; no inference request was made`)
  const pricing = {
    prompt: priceValue(row.pricing.prompt, 'prompt'),
    completion: priceValue(row.pricing.completion, 'completion'),
    request: priceValue(row.pricing.request ?? '0', 'request'),
    expiresAt: Date.now() + PRICING_TTL_MS,
  }
  pricingCache.set(model, pricing)
  return pricing
}

function estimateCostMicros(promptTokens: number, completionTokens: number, pricing: ModelPricing): number {
  const rawUsd = promptTokens * pricing.prompt + completionTokens * pricing.completion + pricing.request
  if (rawUsd === 0) return 0
  const bufferedMicros = rawUsd * 1_000_000 * RESERVATION_BUFFER + FIXED_BUFFER_MICROS
  if (!Number.isFinite(bufferedMicros) || bufferedMicros > Number.MAX_SAFE_INTEGER) throw new Error('OpenRouter preflight cost estimate is invalid')
  return Math.ceil(bufferedMicros)
}

async function performCompletion(options: OpenRouterOptions): Promise<CompletionResult> {
  const key = apiKey()
  const model = configuredOpenRouterModel()
  const fetcher = options.fetcher ?? fetch
  if (!Number.isInteger(options.maxCompletionTokens) || options.maxCompletionTokens < 16 || options.maxCompletionTokens > 4096) {
    throw new Error('OpenRouter maxCompletionTokens must be an integer from 16 to 4096')
  }
  const pricing = await getPricing(model, key, fetcher)
  const serializedMessages = JSON.stringify(options.messages)
  const responseFormat = options.responseFormat ?? { type: 'json_object' }
  const inputTokenUpperBound = Buffer.byteLength(serializedMessages, 'utf8') + Buffer.byteLength(JSON.stringify(responseFormat), 'utf8') + 2048
  const maximumCostMicros = estimateCostMicros(inputTokenUpperBound, options.maxCompletionTokens, pricing)
  const reservationId = reserveUsageRequest(options.db, 'openrouter', options.runId, maximumCostMicros)
  const request = {
    model,
    messages: options.messages,
    max_completion_tokens: options.maxCompletionTokens,
    stream: false,
    response_format: responseFormat,
    provider: { data_collection: 'deny', zdr: true, allow_fallbacks: false, require_parameters: true },
  }
  const requestInit = {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(request),
  } as const
  const fetchCompletion = () => fetcher('https://openrouter.ai/api/v1/chat/completions', {
    ...requestInit,
    signal: AbortSignal.timeout(120_000),
  })
  let response: Response
  try {
    response = await fetchCompletion()
    for (let retry = 0; response.status === 429 && retry < 5; retry += 1) {
      await response.body?.cancel()
      const header = response.headers.get('retry-after')
      let retryAfter = header && /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : NaN
      if (!Number.isFinite(retryAfter) || retryAfter <= 0) retryAfter = Math.min(60, 5 * (2 ** retry))
      if (retryAfter > 60) break
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
      response = await fetchCompletion()
    }
  } catch (error) {
    settleUsageRequest(options.db, reservationId, maximumCostMicros)
    throw new Error('OpenRouter completion failed after reservation; conservatively reconciled at its preflight maximum; saved evidence remains retryable')
  }
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && response.status !== 408) {
      releaseUsageRequest(options.db, reservationId)
      const retryAfter = response.headers.get('retry-after')
      const retrySeconds = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : retryAfter ? (Date.parse(retryAfter) - Date.now()) / 1000 : NaN
      throw new Error(`OpenRouter rejected the completion with HTTP ${response.status}; reservation released; Retry-After=${Number.isFinite(retrySeconds) ? Math.max(0, retrySeconds) : ''}`)
    }
    settleUsageRequest(options.db, reservationId, maximumCostMicros)
    throw new Error(`OpenRouter completion returned HTTP ${response.status}; conservatively reconciled at its preflight maximum`)
  }
  const unknownMetadata: CompletionMetadata = { finishReason: null, requestId: safeRequestId(response.headers.get('x-request-id')), completionLimit: options.maxCompletionTokens, reportedPromptTokens: null, reportedCompletionTokens: null }
  let payload: {
    id?: unknown
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown; native_finish_reason?: unknown }>
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown }
  }
  try {
    payload = await response.json()
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid response envelope')
  } catch {
    settleUsageRequest(options.db, reservationId, maximumCostMicros)
    throw new ModelOutputError('invalid_json', unknownMetadata)
  }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined
  const metadata: CompletionMetadata = {
    ...unknownMetadata,
    finishReason: safeFinishReason(choice?.finish_reason) ?? safeFinishReason(choice?.native_finish_reason),
    requestId: safeRequestId(payload.id) ?? unknownMetadata.requestId,
    reportedPromptTokens: reportedTokens(payload.usage?.prompt_tokens),
    reportedCompletionTokens: reportedTokens(payload.usage?.completion_tokens),
  }
  const message = choice?.message
  const rawContent = message?.content
  const content = typeof rawContent === 'string'
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.filter((part): part is { type?: string; text: string } => Boolean(part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'))
        .map((part) => part.text).join('')
      : ''
  const promptTokens = metadata.reportedPromptTokens
  const completionTokens = metadata.reportedCompletionTokens
  const reportedCost = typeof payload.usage?.cost === 'number' ? payload.usage.cost : NaN
  const actualCostMicros = Number.isFinite(reportedCost) && reportedCost >= 0
    ? Math.ceil(reportedCost * 1_000_000)
    : promptTokens !== null && completionTokens !== null
      ? Math.ceil((promptTokens * pricing.prompt + completionTokens * pricing.completion + pricing.request) * 1_000_000)
      : maximumCostMicros
  // A successful HTTP response is a completed paid request even when the model
  // returns no usable text. Reconcile it before reporting the model-output error.
  settleUsageRequest(options.db, reservationId, actualCostMicros)
  if (['length','max_tokens','max_output_tokens'].includes(metadata.finishReason ?? '')) throw new ModelOutputError('truncated_output', metadata)
  if (!content.trim()) throw new ModelOutputError('invalid_output', metadata)
  return { content, metadata, promptTokens: promptTokens ?? inputTokenUpperBound, completionTokens: completionTokens ?? options.maxCompletionTokens }
}

export async function callOpenRouter(options: OpenRouterOptions): Promise<CompletionResult> {
  const run = options.db.prepare('SELECT cooldown_until FROM runs WHERE id=?').get(options.runId)
  if (run?.cooldown_until && Date.parse(String(run.cooldown_until)) > Date.now()) throw new Error(`Run inference cooldown until ${run.cooldown_until}; saved evidence remains retryable`)
  try {
    const result = await performCompletion(options)
    options.db.prepare('UPDATE runs SET provider_failures=0,cooldown_until=NULL WHERE id=?').run(options.runId)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/HTTP (4\d\d|5\d\d)|completion failed/i.test(message) || (error instanceof ModelOutputError && error.code === 'invalid_output')) {
      const header = message.match(/Retry-After=(.*)$/)?.[1]
      const retrySeconds = header && /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : 0
      const until = new Date(Date.now() + Math.max(60, Number.isFinite(retrySeconds) ? retrySeconds : 0) * 1000).toISOString()
      options.db.prepare('UPDATE runs SET provider_failures=provider_failures+1,cooldown_until=CASE WHEN provider_failures>=1 OR ? THEN ? ELSE cooldown_until END WHERE id=?')
        .run(retrySeconds > 60 ? 1 : 0, until, options.runId)
    }
    throw error
  }
}
