// Run against a server built with PUBLIC_POSTHOG_KEY=phc_test and a test agent number.
// Mocks the SDK module: never sends analytics or opens WhatsApp.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const origin = await page.evaluate(() => location.origin);
  const context = page.context();
  await context.clearCookies();
  await page.route(/(?:module\.[\w-]+\.js|posthog-js\.js)(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `export default {
      init(key, options) { window.__phOptions = options; window.__phEvents = []; },
      capture(event, properties) { window.__phEvents.push({event, properties}); },
      reset() {}
    };`,
  }));
  const visit = async path => {
    await page.goto(origin + path);
  };
  const checkLinks = async ref => {
    const messages = await page.locator('[data-whatsapp-cta]').evaluateAll(links => links.map(link => new URL(link.href).searchParams.get('text')));
    assert(messages.length === 2 && messages[0] === messages[1], 'Both CTAs preserve the same segment message');
    assert(messages.every(text => ref ? text.endsWith(`[ref: ${ref}]`) : !text.includes('[ref:')), `CTA referral ${ref}`);
  };
  const referralCookie = async () => (await context.cookies()).find(cookie => cookie.name === 'milo_ref');
  await visit('/weddings/?ref=A');
  await checkLinks('A');
  assert(!await referralCookie(), 'No referral storage before consent');
  assert(!await page.evaluate(() => window.__phOptions), 'No SDK initialization before consent');
  assert(await page.locator('.cta').evaluate(link => getComputedStyle(link).backgroundColor) === 'rgb(33, 108, 75)', 'Shared CTA retains scoped styles');
  await page.locator('[data-consent="accepted"]').click();
  await page.waitForFunction(() => window.__phEvents?.length === 1);
  let cookie = await referralCookie();
  assert(cookie?.value === 'A' && Math.abs(cookie.expires - Date.now() / 1000 - 2592000) < 10, '30-day cookie');
  assert(cookie.path === '/' && cookie.sameSite === 'Lax', 'Cookie attributes');
  let event = await page.evaluate(() => window.__phEvents[0]);
  assert(event.event === 'outreach_landing_viewed' && event.properties.ref === 'A' && event.properties.landing_path === '/weddings/', 'Initial attributed landing event');
  await page.locator('.cta').evaluate(link => {
    link.addEventListener('click', event => event.preventDefault(), { once: true });
    link.click();
  });
  await page.waitForFunction(() => window.__phEvents.length === 2);
  event = await page.evaluate(() => window.__phEvents[1]);
  assert(event.event === 'whatsapp_cta_clicked' && event.properties.cta_placement === 'hero' && event.properties.ref === 'A', 'Attributed CTA event');
  await visit('/weddings/');
  await checkLinks('A');
  assert((await referralCookie()).expires === cookie.expires, 'Ordinary arrival does not renew expiry');
  await visit('/weddings/?ref=bad%20value');
  await checkLinks('A');
  assert((await referralCookie()).expires === cookie.expires, 'Invalid arrival preserves cookie');
  await visit('/weddings/?ref=B&ref=C');
  await checkLinks('A');
  await visit('/weddings/?ref=B');
  await checkLinks('B');
  assert((await referralCookie()).value === 'B', 'New explicit referral replaces cookie');
  await context.addCookies([{ name: 'milo_ref', value: 'B', url: origin, expires: Date.now() / 1000 - 1 }]);
  await visit('/weddings/');
  await checkLinks();
  await page.waitForFunction(() => window.__phEvents?.length === 1);
  assert(!('ref' in await page.evaluate(() => window.__phEvents[0].properties)), 'Expired attribution omitted');
  await page.evaluate(() => { document.cookie = 'milo_consent=; Max-Age=0; Path=/'; });
  await visit('/weddings/');
  await page.locator('[data-consent="rejected"]').click();
  assert(!await referralCookie(), 'Declining removes referral cookie');
  await visit('/weddings/?ref=Unknown_123');
  await checkLinks('Unknown_123');
  assert(!await page.evaluate(() => window.__phOptions), 'Declined consent skips SDK');

  // Storage exceptions must not break current-page handoff or permitted events.
  await context.clearCookies();
  await page.addInitScript(() => Object.defineProperty(document, 'cookie', { get() { throw new Error('blocked'); }, set() { throw new Error('blocked'); } }));
  await visit('/weddings/?ref=Blocked');
  await checkLinks('Blocked');
  await page.locator('[data-consent="accepted"]').click();
  await page.waitForFunction(() => window.__phEvents?.length === 1);
  await checkLinks('Blocked');
  await page.unroute(/(?:module\.[\w-]+\.js|posthog-js\.js)(?:\?.*)?$/);
  await page.route(/(?:module\.[\w-]+\.js|posthog-js\.js)(?:\?.*)?$/, route => route.abort());
  await visit('/weddings/?ref=Offline');
  await page.locator('[data-consent="accepted"]').click();
  await checkLinks('Offline');
  console.log('Outreach: consent, attributed events, CTA styles, expiry, replacement, duplicates, blocked cookies and SDK failure passed');
}
