export type DiagnosticFields = Record<string, string | number | boolean | null | undefined>;
export interface WorkDiagnostic {
  step: string;
  status: 'started' | 'waiting' | 'streaming' | 'completed' | 'failed' | 'retrying' | 'skipped';
  elapsedMs: number;
  fields?: DiagnosticFields;
  error?: unknown;
}
export type DiagnosticObserver = (event: WorkDiagnostic) => void;

/** Diagnostics must never change processing outcomes or expose prompts/source bodies. */
export function reportDiagnostic(observer: DiagnosticObserver | undefined, event: WorkDiagnostic) {
  try { observer?.(event); } catch { /* Observability is best-effort. */ }
}

export async function diagnosticStep<T>(observer: DiagnosticObserver | undefined, step: string, fields: DiagnosticFields,
  work: () => Promise<T>, summarize?: (value: T) => DiagnosticFields, heartbeatMs = 15000): Promise<T> {
  if (!observer) return work();
  const start = Date.now();
  const report = (status: WorkDiagnostic['status'], extra?: DiagnosticFields, error?: unknown) =>
    reportDiagnostic(observer, { step, status, elapsedMs: Date.now() - start, fields: { ...fields, ...extra }, error });
  report('started');
  const timer = setInterval(() => report('waiting'), heartbeatMs);
  timer.unref();
  try {
    const value = await work();
    let summary: DiagnosticFields | undefined;
    try { summary = summarize?.(value); } catch { /* Keep diagnostic formatting failures out of the pipeline. */ }
    report('completed', summary);
    return value;
  } catch (error) {
    report('failed', undefined, error);
    throw error;
  } finally { clearInterval(timer); }
}

export function modelId(model: import('ai').LanguageModel): string {
  return typeof model === 'string' ? model : model.modelId;
}
export function tokenUsage(response: { usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }): DiagnosticFields {
  return { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, totalTokens: response.usage.totalTokens };
}
