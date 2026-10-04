import { cached, log, requireEnv, sleep } from './util.ts';

const MODEL = () => process.env.PROSPECTOR_MODEL ?? 'google/gemini-3.8-flash';

export interface JsonCall {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
}

/** Call OpenRouter with a JSON schema and return parsed output. Cached by prompt. */
export async function llmJson<T>(call: JsonCall): Promise<T> {
  const model = MODEL();
  const key = JSON.stringify({ model, ...call });
  return cached('llm', key, () => callWithRetry<T>(model, call), 24 * 30);
}

async function callWithRetry<T>(model: string, call: JsonCall): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await callOnce<T>(model, call, attempt > 0 ? 'json_object' : 'json_schema');
    } catch (err) {
      lastErr = err;
      log(`llm attempt ${attempt + 1} failed: ${(err as Error).message.slice(0, 200)}`);
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function callOnce<T>(model: string, call: JsonCall, mode: 'json_schema' | 'json_object'): Promise<T> {
  const system = mode === 'json_object'
    ? `${call.system}\n\nRespond ONLY with JSON matching this JSON schema:\n${JSON.stringify(call.schema)}`
    : call.system;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'X-Title': 'milo-marketing-prospector',
    },
    body: JSON.stringify({
      model,
      temperature: call.temperature ?? 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: call.user },
      ],
      response_format: mode === 'json_schema'
        ? { type: 'json_schema', json_schema: { name: call.schemaName, strict: true, schema: call.schema } }
        : { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const body = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? '';
  return parseJsonLoose<T>(content);
}

export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error(`LLM did not return JSON: ${cleaned.slice(0, 200)}`);
  }
}

/** Helpers to build strict JSON schemas compactly. */
export const S = {
  str: (description?: string) => ({ type: 'string', ...(description && { description }) }),
  num: (description?: string) => ({ type: 'number', ...(description && { description }) }),
  bool: (description?: string) => ({ type: 'boolean', ...(description && { description }) }),
  nullable: (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] }),
  enum: (values: string[], description?: string) => ({ type: 'string', enum: values, ...(description && { description }) }),
  arr: (items: Record<string, unknown>) => ({ type: 'array', items }),
  obj: (properties: Record<string, Record<string, unknown>>) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }),
};
