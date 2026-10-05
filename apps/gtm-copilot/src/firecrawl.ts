import { z } from 'zod';

const responseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    markdown: z.string().optional(),
    html: z.string().optional(),
    metadata: z.object({
      title: z.string().optional(), description: z.string().optional(), language: z.string().optional(),
      sourceURL: z.url().optional(), url: z.url().optional(),
      statusCode: z.number().int().optional(), error: z.string().optional(),
    }).optional(),
    warning: z.string().optional(),
  }).optional(),
});

/** REST client: collection only; keep extraction and evidence validation in our pipeline. */
export async function scrapeWithFirecrawl(target: URL, options: {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  abortSignal?: AbortSignal;
  validateUrl: (url: URL) => Promise<void>;
  isAllowed: (url: URL) => boolean;
}) {
  if (!options.apiKey.trim()) throw new Error('Set FIRECRAWL_API_KEY to use the Firecrawl collector.');
  await options.validateUrl(target);
  if (!options.isAllowed(target)) throw new Error(`robots.txt disallows ${target.href}`);
  const response = await (options.fetch ?? globalThis.fetch)('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${options.apiKey.trim()}`, 'Content-Type': 'application/json' },
    signal: options.abortSignal ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(65000)]) : AbortSignal.timeout(65000),
    body: JSON.stringify({
      url: target.href, formats: ['markdown', 'html'], onlyMainContent: false,
      // Avoid cached activity claims, LLM cleanup, enhanced-proxy escalation, and authentication.
      onlyCleanContent: false, maxAge: 0, storeInCache: false, proxy: 'basic',
      skipTlsVerification: false, timeout: 60000, parsers: [],
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    // Never persist provider bodies: they can contain credentials or excessive diagnostic data.
    throw new Error(`Firecrawl request failed (HTTP ${response.status}); no native fallback attempted.`);
  }
  const chunks: Uint8Array[] = [];
  const reader = response.body?.getReader();
  let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 2_000_000) throw new Error('Firecrawl response exceeds 2 MB limit.');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
  }
  const result = responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  if (!result.success || !result.data) throw new Error('Firecrawl reported an unsuccessful scrape; no fallback attempted.');
  const { data } = result;
  const status = data.metadata?.statusCode;
  if (status === undefined || (status !== 304 && (status < 200 || status >= 300)) || data.metadata?.error) {
    throw new Error(`Firecrawl target page did not load cleanly (HTTP ${status ?? 'unknown'}); no fallback attempted.`);
  }
  // The provider controls transport/redirects. Reject unusable final destinations before retention.
  for (const candidate of [data.metadata?.url, data.metadata?.sourceURL]) {
    if (!candidate) continue;
    const final = new URL(candidate);
    await options.validateUrl(final);
    if (final.origin !== target.origin) throw new Error('Firecrawl returned a cross-origin destination; content discarded.');
    if (!options.isAllowed(final)) throw new Error('robots.txt disallows Firecrawl destination; content discarded.');
  }
  const finalUrl = data.metadata?.url ?? data.metadata?.sourceURL ?? target.href;
  const markdown = data.markdown?.trim();
  if (!markdown) throw new Error('Firecrawl returned no readable Markdown.');
  if (/captcha|verify you are human|log in to continue/i.test(`${markdown}\n${data.metadata?.title ?? ''}`)) {
    throw new Error('Firecrawl returned a login or bot challenge; no bypass or fallback attempted.');
  }
  const text = [
    data.metadata?.title ? `Title: ${data.metadata.title}` : '',
    data.metadata?.description ? `Description: ${data.metadata.description}` : '',
    data.metadata?.language ? `Language: ${data.metadata.language}` : '', markdown,
  ].filter(Boolean).join('\n').slice(0, 40000);
  return { url: finalUrl, text, html: data.html ?? '', warning: data.warning };
}
