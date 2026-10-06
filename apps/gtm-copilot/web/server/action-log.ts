type Context = Record<string, string | number | boolean | null | undefined>;

function redact(text: string): string {
  let safe = text;
  for (const [name, value] of Object.entries(process.env)) {
    if (/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name) && value && value.length >= 4) safe = safe.split(value).join('[REDACTED]');
  }
  return safe.replace(/(Bearer\s+)[^\s"',;]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*["']?)[^\s"'&,;]+/gi, '$1[REDACTED]');
}

function errorDetails(error: unknown, depth = 0): unknown {
  if (depth > 3) return '[cause truncated]';
  if (!(error instanceof Error)) return { message: typeof error === 'string' ? error : 'Unknown error' };
  const extra = error as Error & { statusCode?: number; code?: string; cause?: unknown };
  return { name: error.name, message: error.message, stack: error.stack, statusCode: extra.statusCode, code: extra.code,
    cause: extra.cause === undefined ? undefined : errorDetails(extra.cause, depth + 1) };
}

export function logAction(event: string, context: Context = {}, error?: unknown) {
  const entry = redact(JSON.stringify({ timestamp: new Date().toISOString(), event, ...context,
    ...(error === undefined ? {} : { error: errorDetails(error) }) }));
  if (error === undefined) console.info(`[gtm-copilot] ${entry}`);
  else console.error(`[gtm-copilot] ${entry}`);
}

/** Log returned validation/configuration failures as well as thrown startup failures. */
export function runAction<T extends { error: string | null }>(action: string, context: Context, run: () => T): T {
  logAction(`${action}.requested`, context);
  try {
    const response = run();
    if (response.error) logAction(`${action}.rejected`, context, response.error);
    else logAction(`${action}.accepted`, context);
    return response;
  } catch (error) {
    logAction(`${action}.failed`, context, error);
    throw error;
  }
}
