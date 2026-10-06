import { chromium, errors } from 'playwright';
import { diagnosticStep, reportDiagnostic, type DiagnosticObserver } from './work-diagnostics.ts';

/** Fresh browser context per page: no user cookies, logins, or challenge bypass. */
export async function renderWebHtml(target: URL, options: {
  validateUrl: (url: URL) => Promise<void>;
  isAllowed: (url: URL) => boolean;
  abortSignal?: AbortSignal;
  onDiagnostic?: DiagnosticObserver;
}) {
  const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000);
  signal.throwIfAborted();
  await options.validateUrl(target);
  if (!options.isAllowed(target)) throw new Error('robots.txt disallows browser destination.');
  signal.throwIfAborted();
  const browser = await diagnosticStep(options.onDiagnostic, 'collection.browser.launch', {}, () => chromium.launch({
    headless: true,
    ...(process.env.GTM_PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.GTM_PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  }));
  const abort = () => { void browser.close().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const limitations: string[] = [];
  try {
    signal.throwIfAborted();
    const context = await browser.newContext({ userAgent: 'GtmCopilot/1.0', serviceWorkers: 'block', acceptDownloads: false });
    context.setDefaultTimeout(20000);
    context.setDefaultNavigationTimeout(60000);
    const page = await context.newPage();
    await context.routeWebSocket('**/*', (socket) => socket.close());
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (['image', 'font', 'media'].includes(request.resourceType())) { await route.abort(); return; }
      try {
        const url = new URL(request.url());
        await options.validateUrl(url);
        const navigation = request.isNavigationRequest();
        // Public CDNs/API calls may power rendering, but documents stay in the reviewed origin.
        if (navigation && (url.origin !== target.origin || !options.isAllowed(url))) { await route.abort(); return; }
        await route.continue();
      } catch { await route.abort(); }
    });
    page.on('pageerror', () => reportDiagnostic(options.onDiagnostic, { step: 'collection.browser.javascript', status: 'waiting', elapsedMs: 0, fields: { reason: 'Page JavaScript reported an error; rendering continues' } }));
    const response = await diagnosticStep(options.onDiagnostic, 'collection.browser.navigate', { hostname: target.hostname, path: target.pathname }, () => page.goto(target.href, { waitUntil: 'load' }));
    if (!response || !response.ok()) throw new Error(`Browser page failed (HTTP ${response?.status() ?? 'unknown'}).`);
    await diagnosticStep(options.onDiagnostic, 'collection.browser.render', {}, async () => {
      try { await page.waitForLoadState('networkidle', { timeout: 10000 }); }
      catch (error) {
        if (!(error instanceof errors.TimeoutError)) throw error;
        limitations.push('Background networking remained active; captured the DOM after a rendering-settle window.');
      }
      // Give asynchronous hydration time to run, then wait for content mutations to settle.
      await page.waitForTimeout(1000);
      const settled = await page.evaluate(() => new Promise<boolean>((resolve) => {
        let quiet: ReturnType<typeof setTimeout>;
        const finish = (settled: boolean) => { clearTimeout(quiet); clearTimeout(limit); observer.disconnect(); resolve(settled); };
        const reset = () => { clearTimeout(quiet); quiet = setTimeout(() => finish(true), 1000); };
        const observer = new MutationObserver(reset);
        const limit = setTimeout(() => finish(false), 10000);
        observer.observe(document.body ?? document.documentElement, { childList: true, characterData: true, attributes: true, subtree: true });
        reset();
      }));
      if (!settled) limitations.push('DOM mutations remained active; captured the DOM at the rendering-settle limit.');
    });
    const final = new URL(page.url());
    await options.validateUrl(final);
    if (final.origin !== target.origin || !options.isAllowed(final)) throw new Error('Browser navigated outside the permitted destination.');
    const body = await page.locator('body').innerText();
    if (/captcha|verify you are human|log in to continue/i.test(body)) throw new Error('Login or bot challenge; no bypass attempted.');
    signal.throwIfAborted();
    const html = await page.content();
    if (Buffer.byteLength(html) > 2_000_000) throw new Error('Rendered HTML exceeds 2 MB limit.');
    return { url: final.href, html, limitations };
  } finally {
    signal.removeEventListener('abort', abort);
    await browser.close();
  }
}
